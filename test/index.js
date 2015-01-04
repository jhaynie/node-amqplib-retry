/*jslint indent: 2*/
/*global require:true, describe:true, it:true, before:true, after:true, beforeEach:true, afterEach:true*/
(function () {
  'use strict';

  require('should');

  var Promise = require('bluebird'),
    sinon = require('sinon'),
    amqp = require('amqplib'),
    Retry = require('../lib/index'),
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
      return Promise.all([
        channel.checkQueue(ENTRY_QUEUE_NAME),
        channel.checkQueue(DELAY_QUEUE_NAME),
        channel.checkQueue(READY_QUEUE_NAME),
        channel.checkQueue(FAILURE_QUEUE_NAME)
      ]);
    }

    function startListenerAndPushMessage(handler, delayFunction) {
      return Promise.resolve()
        .then(function () {
          var retry = new Retry({
            channel: channel,
            consumerQueue: ENTRY_QUEUE_NAME,
            failureQueue: FAILURE_QUEUE_NAME,
            handler: handler,
            delay: delayFunction ||  hardcodedDelay(-1)
          });
          return channel.consume(ENTRY_QUEUE_NAME, retry, {consumerTag: CONSUMER_TAG});
        })
        .then(function () {
          return channel.sendToQueue(ENTRY_QUEUE_NAME, new Buffer('abc'));
        });
    }

    before(function () {
      return Promise.resolve(amqp.connect('amqp://guest:guest@localhost:5672'))
        .then(function (conn) {
          return conn.createChannel();
        })
        .then(function (ch) {
          Promise.promisifyAll(ch);
          channel = ch;
          return ch;
        })
        .tap(function (ch) {
          return Promise.all([
            ch.assertQueue(ENTRY_QUEUE_NAME, {durable: false}),
            ch.assertQueue(FAILURE_QUEUE_NAME, {durable: false})
          ]);
        });
    });

    beforeEach(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return Promise.all([
            ch.purgeQueue(ENTRY_QUEUE_NAME),
            ch.purgeQueue(FAILURE_QUEUE_NAME)
          ]);
        });
    });

    afterEach(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return Promise.all([
            ch.cancel(CONSUMER_TAG)
          ]);
        });
    });

    after(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return Promise.all([
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

    it('acks a successfully handled message (delayed promise)', function () {
      function delayedSuccess() {
        return Promise.resolve()
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

    it('FAIL delivery works for delayed promise handlers', function () {
      function delayedFail() {
        return Promise.resolve()
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
      var spy = sinon.spy(function () {
        if (spy.callCount < 3) {
          throw new Error('example error');
        }
      });

      return startListenerAndPushMessage(spy, hardcodedDelay(200))
        .delay(1000) // enough time for at least four iterations
        .then(function () {
          spy.calledThrice.should.be.eql(true);
        });
    });

    it('must pass an options object', function () {
      /*jshint -W068 */ // disabled JSHINT warning: "Wrapping non-IIFE function literals in parens is unnecessary."
      (function () {
        return new Retry();
      }).should.throw();
    });

  });

}());

