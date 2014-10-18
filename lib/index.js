(function () {
  'use strict';

  var _ = require('underscore'),
    Promise = require('bluebird'),
    EXCHANGE_NAME = 'rabbitmq-retry',
    DELAYED_QUEUE_NAME = 'rabbitmq-retry-delayed',
    READY_QUEUE_NAME = 'rabbitmq-retry-ready',
    READY_ROUTE_KEY = 'ready';

  function getDefaultDelay(retry) {
    var delay = Math.pow(2, retry);
    if (delay > 60 * 60 * 24) {
      // the delay for the message is longer than 24 hours.  Fail the message and never retry again.
      return -1;
    }
    return delay;
  }


  function Constructor(channel, clientQueueName, failureQueueName, delayFunction, clientHandler) {
    var isAllInitialized;

    if (!channel) {
      throw Error('\'channel\' not specified.  See documentation.');
    }
    if (!clientQueueName) {
      throw Error('\'clientQueueName\' not specified.  See documentation.');
    }
    if (!failureQueueName) {
      throw Error('\'failureQueueName\' not specified.  See documentation.');
    }
    if (!clientHandler) {
      throw Error('\'clientHandler\' not specified.  See documentation.');
    }

    Promise.promisifyAll(channel);
    clientHandler = Promise.promisify(clientHandler);

    function initializeAndStartReadyQueueConsumer() {
      return Promise.resolve()
        .then(function () {
          return Promise.all([
            channel.assertQueue(DELAYED_QUEUE_NAME, {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': EXCHANGE_NAME,
                'x-dead-letter-routing-key': READY_ROUTE_KEY
              }
            }),
            channel.assertQueue(READY_QUEUE_NAME, {durable: true}),
            channel.checkQueue(failureQueueName),
            channel.assertExchange(EXCHANGE_NAME, 'direct', {durable: true})
          ]);
        })
        .then(function () {
          return channel.bindQueue(READY_QUEUE_NAME, EXCHANGE_NAME, READY_ROUTE_KEY);
        })
        .then(function () {
          isAllInitialized = true;
          channel.consume(READY_QUEUE_NAME, function (msg) {
            Promise.resolve()
              .then(function () {
                var targetQueueName = msg.properties.headers._targetQueue,
                  properties = msg.properties.headers._originalProperties;
                return channel.sendToQueue(targetQueueName, new Buffer(msg), properties);
              })
              .then(function () {
                return channel.ack(msg);
              })
              .catch(function (err) {
                console.error('Error while trying to process message from ready queue.  err: ' + err + ', msg: ' + JSON.stringify(msg));
                channel.nack(msg);
              });
          });
        });
    }


    function errorHandler(msg) {
      if (!isAllInitialized) {
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
      return channel.publish('', DELAYED_QUEUE_NAME, new Buffer(msg.content), properties);
    }


    initializeAndStartReadyQueueConsumer();

    function handlerWrapper(msg) {
      return clientHandler(msg)
        .catch(function () {
          return errorHandler(msg)
            .then(function () {
              return channel.ack(msg);
            });
        });
    }

    return handlerWrapper;
  }

  module.exports = Constructor;
}());
