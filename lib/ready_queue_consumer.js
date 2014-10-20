(function () {
  'use strict';

  var READY_QUEUE_NAME = 'rabbitmq-retry-ready',
    Promise = require('bluebird');

  module.exports = function (channel) {
    return {
      start: function () {
        return Promise.resolve()
          .then(function () {
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
    };
  };
}());
