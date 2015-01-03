(function () {
  'use strict';

  var _ = require('underscore'),
    Promise = require('bluebird'),
    config = require('./config');

  function getDefaultDelay(retry) {
    var delay = Math.pow(2, retry);
    if (delay > 60 * 60 * 24) {
      // the delay for the message is longer than 24 hours.  Fail the message and never retry again.
      return -1;
    }
    return delay;
  }


  module.exports = function (channel, clientQueueName, failureQueueName, clientHandler, delayFunction, initializer) {

    function errorHandler(msg) {
      if (!initializer.isInitialized) {
        // Delay in 1 MS to let the queues/exchange/bindings initialize
        return Promise.delay(1)
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
        expiration: (expiration * 1000).toString() // must be a string in milliseconds
      });
      return channel.publish('', config.delayQueueName, new Buffer(msg.content), properties);
    }


    function handlerWrapper(msg) {
      return Promise.try(clientHandler(msg))
        .catch(function () {
          // something went wrong.  Let's handle this message.
          return Promise.resolve(msg)
            .then(errorHandler)
            .catch(function (err) {
              // something went wrong while trying to process the erroneous message.
              // Sending nack so the client can try to process it again.
              channel.nack(msg);
              throw err;
            });
        })
        .then(function () {
          // we ack it for the user.  Either way if the message has been processed successfully or
          // not, the message should be out of the original queue, therefore - acked.
          return channel.ack(msg);
        });
    }

    return handlerWrapper;
  };
}());