'use strict';

var Initializer = require('./initializer'),
  Consumer = require('./ready_queue_consumer'),
  AmqpHandlerWrapper = require('./amqp_handler_wrapper');

module.exports = function (options) {
  // validate options
  if (!options.channel) {
    throw new Error('\'channel\' not specified.  See documentation.');
  }
  if (!options.consumerQueue) {
    throw new Error('\'consumerQueue\' not specified.  See documentation.');
  }
  if (!options.handler) {
    throw new Error('\'handler\' not specified.  See documentation.');
  }

  // set defaults
  if (!options.failureQueue) {
    options.failureQueue = options.consumerQueue + '.failure';
  }

  // initializing the objects
  var initializer = new Initializer(options.channel, options.consumerQueue, options.failureQueue),
    consumer = new Consumer(options.channel),
    wrapper = new AmqpHandlerWrapper(options.channel, options.consumerQueue, options.failureQueue, options.handler, options.delay, initializer);

  // initializing the queues, exchange and binding. Then starting the consumer
  initializer.initialize()
    .then(consumer.start);

  // returning wrapper for given amqp handler function.
  return wrapper;
};
