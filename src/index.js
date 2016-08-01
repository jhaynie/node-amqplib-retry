const Initializer = require('./initializer')
const ReadyQueueConsumer = require('./ready_queue_consumer')
const amqpHandlerWrapper = require('./amqp_handler_wrapper')

module.exports = (options) => {
  // validate options
  if (!options.channel) {
    throw new Error('\'channel\' not specified.  See documentation.')
  }
  if (!options.consumerQueue) {
    throw new Error('\'consumerQueue\' not specified.  See documentation.')
  }
  if (!options.handler) {
    throw new Error('\'handler\' not specified.  See documentation.')
  }

  // set defaults
  if (!options.failureQueue) {
    options.failureQueue = options.consumerQueue + '.failure'
  }

  // initializing the objects
  const initializer = new Initializer(options.channel, options.consumerQueue, options.failureQueue)
  const consumer = new ReadyQueueConsumer(options.channel)
  const wrapper = amqpHandlerWrapper(options.channel, options.consumerQueue, options.failureQueue, options.handler, options.delay, initializer)

  // initializing the queues, exchange and binding. Then starting the consumer
  initializer
    .initialize()
    .then(() => consumer.start())

  // returning wrapper for given amqp handler function.
  return wrapper
}
