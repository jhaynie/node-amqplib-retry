'use strict';

var _ = require('underscore'),
  BPromise = require('bluebird'),
  config = require('./config');

// must be a string in milliseconds
function getDefaultDelay (attempts) {
  var delay = Math.pow(2, attempts);
  if (delay > 60 * 60 * 24) {
    // the delay for the message is longer than 24 hours.  Fail the message and never retry again.
    return -1;
  }
  return delay * 1000;
}

module.exports = function (channel, clientQueueName, failureQueueName, clientHandler, delayFunction, initializer) {

  function errorHandler (msg) {

    if (!initializer.isInitialized) {
      // Delay in 1 MS to let the queues/exchange/bindings initialize
      return BPromise.delay(1)
        .then(function () {
          return errorHandler(msg);
        });
    }

    var expiration,
      properties;

    _.defaults(msg, {properties: {}});
    _.defaults(msg.properties, {headers: {}});
    _.defaults(msg.properties.headers, {_retryCount: 0}); // _retryCount: 0 means this message has never been retried before.

    msg.properties.headers._retryCount += 1;
    expiration = (delayFunction || getDefaultDelay)(msg.properties.headers._retryCount);

    if (expiration < 1) {
      return channel.sendToQueue(failureQueueName, new Buffer(msg.content), msg.properties);
    }

    properties = {
      persistent: true,
      headers: {
        _originalProperties: msg.properties, // save the original properties.
        _targetQueue: clientQueueName // save the target queue name we should publish to after the delay is over.
      }
    };

    _.extend(properties, {
      expiration: expiration.toString()
    });

    return channel.publish('', config.delayQueueName, new Buffer(msg.content), properties);
  }

  function handlerWrapper (msg) {
    return BPromise.resolve(msg)
      .then(clientHandler)
      .catch(function (err) {
        // Something went wrong. Let's handle this message.
        // Adding the string 'error' to support papertrail error filters.
        console.error('Error: AMQP retry handler caught the following error: ', err);
        return BPromise.resolve(msg)
          .then(errorHandler)
          .catch(function (err) {
            // Something went wrong while trying to process the erroneous message.
            // Sending nack so the client can try to process it again.
            channel.nack(msg);
            throw err;
          });
      })
      .then(function () {
        // We ack it for the user. Either way if the message has been processed successfully or
        // not, the message should be out of the original queue, therefore - acked.
        return channel.ack(msg);
      });
  }

  return handlerWrapper;
};
