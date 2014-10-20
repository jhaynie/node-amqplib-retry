(function () {
  'use strict';

  var EXCHANGE_NAME = 'rabbitmq-retry',
    READY_QUEUE_NAME = 'rabbitmq-retry-ready',
    DELAYED_QUEUE_NAME = 'rabbitmq-retry-delayed',
    READY_ROUTE_KEY = 'ready',
    Promise = require('bluebird');


  module.exports = function (channel, clientQueueName, failureQueueName) {
    return {
      initialize: function () {
        return Promise.resolve()
          .bind(this)
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
              channel.checkQueue(clientQueueName),
              channel.checkQueue(failureQueueName),
              channel.assertExchange(EXCHANGE_NAME, 'direct', {durable: true})
            ]);
          })
          .then(function () {
            return channel.bindQueue(READY_QUEUE_NAME, EXCHANGE_NAME, READY_ROUTE_KEY);
          }).then(function () {
            this.isInitialized = true;
          });
      }
    };
  };
}());
