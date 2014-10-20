(function () {
  'use strict';

  var DELAYED_QUEUE_NAME = 'rabbitmq-retry-delayed',
    EXCHANGE_NAME = 'rabbitmq-retry',
    READY_QUEUE_NAME = 'rabbitmq-retry-ready',
    READY_ROUTE_KEY = 'ready';

  module.exports = {
    exchangeName: EXCHANGE_NAME,
    readyRouteKey: READY_ROUTE_KEY,
    delayQueueName: DELAYED_QUEUE_NAME,
    readyQueueName: READY_QUEUE_NAME
  };
}());
