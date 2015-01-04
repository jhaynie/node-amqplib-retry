(function () {
  'use strict';

  var EXCHANGE_NAME = 'amqplib-retry',
    DELAYED_QUEUE_NAME = 'amqplib-retry.delayed',
    READY_QUEUE_NAME = 'amqplib-retry.ready',
    READY_ROUTE_KEY = 'ready';

  module.exports = {
    exchangeName: EXCHANGE_NAME,
    delayQueueName: DELAYED_QUEUE_NAME,
    readyQueueName: READY_QUEUE_NAME,
    readyRouteKey: READY_ROUTE_KEY
  };

}());

