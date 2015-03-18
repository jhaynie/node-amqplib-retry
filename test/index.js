'use strict';

require('should');

var BPromise = require('bluebird'),
  sinon = require('sinon'),
  amqp = require('amqplib'),
  retry = require('../lib/index'),
  config = require('../lib/config'),
  ENTRY_QUEUE_NAME = 'amqplib-retry.tests',
  DELAY_QUEUE_NAME = config.delayQueueName,
  READY_QUEUE_NAME = config.readyQueueName,
  FAILURE_QUEUE_NAME = 'amqplib-retry.tests.failure',
  CONSUMER_TAG = 'amqplib-retry.tests';

describe('amqplib-retry', function () {

  var channel;

  function hardcodedDelay(delay) {
    return function () {
      return delay;
    };
  }

  function checkQueues() {
    return BPromise.all([
      channel.checkQueue(ENTRY_QUEUE_NAME),
      channel.checkQueue(DELAY_QUEUE_NAME),
      channel.checkQueue(READY_QUEUE_NAME),
      channel.checkQueue(FAILURE_QUEUE_NAME)
    ]);
  }

  function startListenerAndPushMessage(handler, delayFunction) {
    return BPromise.resolve()
      .then(function () {
        var retryHandler = retry({
          channel: channel,
          consumerQueue: ENTRY_QUEUE_NAME,
          failureQueue: FAILURE_QUEUE_NAME,
          handler: handler,
          delay: delayFunction || hardcodedDelay(-1)
        });
        return channel.consume(ENTRY_QUEUE_NAME, retryHandler, {consumerTag: CONSUMER_TAG});
      })
      .then(function () {
        return channel.sendToQueue(ENTRY_QUEUE_NAME, new Buffer('abc'));
      });
  }

  before(function () {
    return BPromise.resolve(amqp.connect('amqp://guest:guest@localhost:5672'))
      .then(function (conn) {
        return conn.createChannel();
      })
      .then(function (ch) {
        BPromise.promisifyAll(ch);
        channel = ch;
        return ch;
      })
      .tap(function (ch) {
        return BPromise.all([
          ch.assertQueue(ENTRY_QUEUE_NAME, {durable: false}),
          ch.assertQueue(FAILURE_QUEUE_NAME, {durable: false})
        ]);
      });
  });

  beforeEach(function () {
    return BPromise.resolve(channel)
      .tap(function (ch) {
        return BPromise.all([
          ch.purgeQueue(ENTRY_QUEUE_NAME),
          ch.purgeQueue(FAILURE_QUEUE_NAME)
        ]);
      });
  });

  afterEach(function () {
    return BPromise.resolve(channel)
      .tap(function (ch) {
        return BPromise.all([
          ch.cancel(CONSUMER_TAG)
        ]);
      });
  });

  after(function () {
    return BPromise.resolve(channel)
      .tap(function (ch) {
        return BPromise.all([
          ch.deleteQueue(ENTRY_QUEUE_NAME),
          ch.deleteQueue(FAILURE_QUEUE_NAME)
        ]);
      })
      .delay(500);
  });

  it('acks a successfully handled message', function () {
    function success() {
    }

    return startListenerAndPushMessage(success)
      .delay(200)
      .then(checkQueues)
      .spread(function (entry, delay, ready, failed) {
        entry.messageCount.should.be.eql(0);
        delay.messageCount.should.be.eql(0);
        ready.messageCount.should.be.eql(0);
        failed.messageCount.should.be.eql(0);
      });
  });

  it('acks a successfully handled message (delayed BPromise)', function () {
    function delayedSuccess() {
      return BPromise.resolve()
        .delay(250)
        .then(function () {
          return;
        });
    }

    return startListenerAndPushMessage(delayedSuccess)
      .delay(400)
      .then(checkQueues)
      .spread(function (entry, delay, ready, failed) {
        entry.messageCount.should.be.eql(0);
        delay.messageCount.should.be.eql(0);
        ready.messageCount.should.be.eql(0);
        failed.messageCount.should.be.eql(0);
      });
  });

  it('a delay of -1 should send the message to the FAIL queue', function () {
    function fail() {
      throw new Error('example error');
    }

    return startListenerAndPushMessage(fail)
      .delay(200)
      .then(checkQueues)
      .spread(function (entry, delay, ready, failed) {
        entry.messageCount.should.be.eql(0);
        delay.messageCount.should.be.eql(0);
        ready.messageCount.should.be.eql(0);
        failed.messageCount.should.be.eql(1);
      });
  });

  it('FAIL delivery works for delayed BPromise handlers', function () {
    function delayedFail() {
      return BPromise.resolve()
        .delay(200)
        .then(function () {
          throw new Error('example error');
        });
    }

    return startListenerAndPushMessage(delayedFail)
      .delay(500)
      .then(checkQueues)
      .spread(function (entry, delay, ready, failed) {
        entry.messageCount.should.be.eql(0);
        delay.messageCount.should.be.eql(0);
        ready.messageCount.should.be.eql(0);
        failed.messageCount.should.be.eql(1);
      });
  });

  it('should retry a failed message multiple times', function () {
    var msg,
      spy = sinon.spy(function (obj) {
        msg = obj;
        if (spy.callCount < 3) {
          throw new Error('example error');
        }
      });

    return startListenerAndPushMessage(spy, hardcodedDelay(200))
      .delay(1000) // enough time for at least four iterations
      .then(function () {
        spy.calledThrice.should.be.eql(true);
        msg.content.toString().should.be.eql('abc');
      });
  });

  it('must pass an options object', function () {
    /*eslint-disable no-wrap-func */
    (function () {
      return retry();
    }).should.throw();
    /*eslint-enable no-wrap-func */
  });
});
