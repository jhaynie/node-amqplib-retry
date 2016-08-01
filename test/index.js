require('should')

const Promise = require('bluebird')
const sinon = require('sinon')
const amqp = require('amqplib')
const retry = require('../src/index')
const config = require('../src/config')
const ENTRY_QUEUE_NAME = 'amqplib-retry.tests'
const DELAY_QUEUE_NAME = config.delayQueueName
const READY_QUEUE_NAME = config.readyQueueName
const FAILURE_QUEUE_NAME = 'amqplib-retry.tests.failure'
const CONSUMER_TAG = 'amqplib-retry.tests'

describe('amqplib-retry', () => {
  let channel

  const hardcodedDelay = (delay) => () => delay

  const checkQueues = () => {
    return Promise.all([
      channel.checkQueue(ENTRY_QUEUE_NAME),
      channel.checkQueue(DELAY_QUEUE_NAME),
      channel.checkQueue(READY_QUEUE_NAME),
      channel.checkQueue(FAILURE_QUEUE_NAME)
    ])
  }

  const startListenerAndPushMessage = (handler, delayFunction) =>
    Promise
      .try(function () {
        const retryHandler = retry({
          channel: channel,
          consumerQueue: ENTRY_QUEUE_NAME,
          failureQueue: FAILURE_QUEUE_NAME,
          handler: handler,
          delay: delayFunction || hardcodedDelay(-1)
        })
        return channel.consume(ENTRY_QUEUE_NAME, retryHandler, { consumerTag: CONSUMER_TAG })
      })
      .then(() => channel.sendToQueue(ENTRY_QUEUE_NAME, new Buffer('abc')))

  before(() =>
    Promise
      .resolve(amqp.connect('amqp://guest:guest@localhost:5672'))
      .then((conn) => conn.createChannel())
      .then((ch) => {
        Promise.promisifyAll(ch)
        channel = ch
        return ch
      })
      .tap((ch) =>
        Promise.all([
          ch.assertQueue(ENTRY_QUEUE_NAME, { durable: false }),
          ch.assertQueue(FAILURE_QUEUE_NAME, { durable: false })
        ])
      )
  )

  beforeEach(() =>
    Promise
      .resolve(channel)
      .tap((ch) =>
        Promise.all([
          ch.purgeQueue(ENTRY_QUEUE_NAME),
          ch.purgeQueue(FAILURE_QUEUE_NAME)
        ])
      )
  )

  afterEach(() =>
    Promise
      .resolve(channel)
      .tap((ch) => Promise.all([ch.cancel(CONSUMER_TAG)]))
  )

  after(() =>
    Promise
      .resolve(channel)
      .tap((ch) =>
        Promise.all([
          ch.deleteQueue(ENTRY_QUEUE_NAME),
          ch.deleteQueue(FAILURE_QUEUE_NAME)
        ])
      )
      .delay(500)
  )

  it('acks a successfully handled message', () => {
    const success = () => {
    }

    return startListenerAndPushMessage(success)
      .delay(200)
      .then(checkQueues)
      .spread((entry, delay, ready, failed) => {
        entry.messageCount.should.be.eql(0)
        delay.messageCount.should.be.eql(0)
        ready.messageCount.should.be.eql(0)
        failed.messageCount.should.be.eql(0)
      })
  })

  it('acks a successfully handled message (delayed Promise)', () => {
    const delayedSuccess =
      () =>
        Promise.resolve()
          .delay(250)
          .then(() => {
          })

    return startListenerAndPushMessage(delayedSuccess)
      .delay(400)
      .then(checkQueues)
      .spread((entry, delay, ready, failed) => {
        entry.messageCount.should.be.eql(0)
        delay.messageCount.should.be.eql(0)
        ready.messageCount.should.be.eql(0)
        failed.messageCount.should.be.eql(0)
      })
  })

  it('a delay of -1 should send the message to the FAIL queue', () => {
    const fail = () => {
      throw new Error('example error')
    }

    return startListenerAndPushMessage(fail)
      .delay(200)
      .then(checkQueues)
      .spread((entry, delay, ready, failed) => {
        entry.messageCount.should.be.eql(0)
        delay.messageCount.should.be.eql(0)
        ready.messageCount.should.be.eql(0)
        failed.messageCount.should.be.eql(1)
      })
  })

  it('FAIL delivery works for delayed Promise handlers', () => {
    const delayedFail = () =>
      Promise
        .resolve()
        .delay(200)
        .then(() => {
          throw new Error('example error')
        })

    return startListenerAndPushMessage(delayedFail)
      .delay(500)
      .then(checkQueues)
      .spread((entry, delay, ready, failed) => {
        entry.messageCount.should.be.eql(0)
        delay.messageCount.should.be.eql(0)
        ready.messageCount.should.be.eql(0)
        failed.messageCount.should.be.eql(1)
      })
  })

  it('should retry a failed message multiple times', () => {
    let msg

    const spy = sinon.spy((obj) => {
      msg = obj
      if (spy.callCount < 3) {
        throw new Error('example error')
      }
    })

    return startListenerAndPushMessage(spy, hardcodedDelay(200))
      .delay(1000) // enough time for at least four iterations
      .then(() => {
        spy.calledThrice.should.be.eql(true)
        msg.content.toString().should.be.eql('abc')
      })
  })

  it('must pass an options object', () => {
    (() => {
      return retry()
    }).should.throw()
  })
})
