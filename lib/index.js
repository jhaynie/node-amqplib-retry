(function () {
  'use strict';

  var _ = require('underscore'),
    Promise = require('bluebird'),
    amqp = require('amqplib'),
    AMQP_URL,
    DELAY_FUNCTION,
    EXCHANGE_NAME = 'rabbitmq-retry',
    DELAYED_QUEUE_NAME = 'rabbitmq-retry-delayed',
    READY_QUEUE_NAME = 'rabbitmq-retry-ready',
    FAILURE_QUEUE_NAME,
    READY_ROUTE_KEY = 'ready',
    connection;

  // Default implementation of a function that should return the delay in seconds for a given retry count.

  // retry = 1, delay = 2 sec.
  // retry = 2, delay = 4 sec.
  // retry = 3, delay = 8 sec.
  // retry = 4, delay = 16 sec.
  // retry = 5, delay = 32 sec.
  // retry = 6, delay = 64 sec.
  // retry = 7, delay = 128 sec.
  // retry = 8, delay = 256 sec.
  // retry = 9, delay = 512 sec.
  // retry = 10, delay = 1024 sec.
  // retry = 11, delay = 2048 sec.
  // retry = 12, delay = 4096 sec.
  // retry = 13, delay = 8192 sec.
  // retry = 14, delay = 16384 sec.
  // retry = 15, delay = 32768 sec.
  // retry = 16, delay = 65536 sec.
  // retry = 17, delay = -1 sec => fail message

  // 60 * 60 * 24 seconds = 86400 seconds = 1 day.

  function getDelay(retry) {
    var delay = Math.pow(2, retry);
    if (delay > 60 * 60 * 24) {
      // the delay for the message is longer than 24 hours.  Fail the message and never retry again.
      return -1;
    }
    return delay;
  }

  function connect() {
    if (!connection) {
      connection = amqp.connect(AMQP_URL);
    }
    return connection;
  }

  function Constructor(options) {
    options = options || {};
    if (!options.failureQueueName) {
      throw Error('\'failureQueueName\' not specified.  See documentation.');
    }
    FAILURE_QUEUE_NAME = options.failureQueueName;
    AMQP_URL = options.amqpUrl || 'amqp://guest:guest@localhost:5672';
    DELAY_FUNCTION = options.delayFunction || getDelay;
  }

  Constructor.prototype.retry = function (msg, targetQueueName) {
    var channel;
    return Promise.resolve()
      .then(function () {
        return connect();
      })
      .then(function (conn) {
        // optional future =improvement - maybe we should keep the channel open?
        return conn.createChannel();
      })
      .then(function (ch) {
        channel = ch;
        return Promise.promisifyAll(channel);
      })
      .then(function () {
        var data = JSON.parse(msg),
          expiration,
          properties;
        _.defaults(data, {properties: {}});
        _.defaults(data.properties, {headers: {}});
        _.defaults(data.properties.headers, {_retryCount: 0}); // _retryCount: 0 means this message has never been retried before.
        data.properties.headers._retryCount += 1;
        expiration = DELAY_FUNCTION(data.properties.headers._retryCount);
        properties = {
          persistent: true,
          headers: {
            _originalProperties: data.properties, // save the original properties.
            _targetQueue: targetQueueName // save the target queue name we should publish to after the delay is over.
          }
        };

        if (expiration < 1) {
          return channel.sendToQueue(FAILURE_QUEUE_NAME, new Buffer(data), properties);
        }

        _.extend(properties, {
          expiration: expiration + '000' // must be a string in milliseconds
        });
        return channel.publish('', DELAYED_QUEUE_NAME, new Buffer(data), properties);
      });
  };

  Constructor.prototype.start = function () {
    var channel;
    return Promise.resolve()
      .then(function () {
        return connect();
      })
      .then(function (conn) {
        return conn.createChannel();
      })
      .then(function (ch) {
        channel = ch;
        return Promise.promisifyAll(channel);
      })
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
          channel.checkQueue(FAILURE_QUEUE_NAME),
          channel.assertExchange(EXCHANGE_NAME, 'direct', {durable: true})
        ]);
      })
      .then(function () {
        return channel.bindQueue(READY_QUEUE_NAME, EXCHANGE_NAME, READY_ROUTE_KEY);
      })
      .then(function () {
        channel.consume(READY_QUEUE_NAME, function (msg) {
          Promise.resolve()
            .then(function () {
              var targetQueueName = msg.properties.headers._targetQueue,
                properties = msg.properties.headers._originalProperties;
              return channel.publish('', targetQueueName, new Buffer(msg), properties);
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
  };

  module.exports = Constructor;
}());
