(function(window) {
  'use strict';

  function debug(str) {
    console.log('MANU ContactsService -*-:' + str);
  }

  var _contacts = navigator.mozContacts;

  function _updateContact(realObj, fakeObj) {
    for (var key in realObj) {
      if (typeof realObj[key] === 'function') {
        continue;
      }

      if (realObj[key] instanceof Date) {
        if (+realObj[key] !== +fakeObj[key]) {
          realObj[key] = fakeObj[key];
        }
        continue;
      }

      if (typeof realObj[key] === 'object') {
        realObj[key] = _updateContact(realObj[key], fakeObj[key]);
        continue;
      }

      if (realObj[key] !== fakeObj[key]) {
        realObj[key] = fakeObj[key];
      }
    }

    return realObj;
  }

  function buildDOMRequestAnswer(operation, channel, request) {
    debug('Building call --> ' + JSON.stringify(request));
    var remotePortId = request.remotePortId;
    var reqId = request.remoteData.id;
    var opData = request.remoteData.data.params || [];

    _contacts[operation](...opData).then(result => {
      channel.postMessage({
        remotePortId: remotePortId,
        data: { id : reqId, result: result }
      });
    }).catch(sendError.bind(channel, request));
  }

  function setHandler(channel, request) {
    var remotePortId = request.remotePortId;
    var reqId = request.remoteData.id;

    function listenerTemplate(evt) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: reqId,
          event: {
            contactID: evt.contactID,
            reason: evt.reason
          }
        }
      });
    }

    _contacts.oncontactchange = listenerTemplate;
  }

  function buildDOMCursorAnswer(channel, request) {
    var remotePortId = request.remotePortId;
    // Params for the local operation:
    var opData = request.remoteData.data.params || [];
    var reqId = request.remoteData.id;

    var cursor = _contacts.getAll(...opData);
    var contacts = [];

    cursor.onsuccess = () => {
      if (!cursor.done) {
        contacts.push(window.ServiceHelper.cloneObject(cursor.result));
        cursor.continue();
      } else {
        // Send message
        channel.postMessage({
          remotePortId: remotePortId,
          data: { id : reqId, result: contacts }
        });
      }
    };

    cursor.onerror = () => {
      sendError(channel, request, cursor.error);
    };
  }

  function sendError(channel, request, error) {
    var remotePortId = request.remotePortId;
    var reqId = request.remoteData.id;

    channel.postMessage({
      remotePortId: remotePortId,
      data: {
        id : reqId,
        error: window.ServiceHelper.cloneObject(error)
      }
    });
  }

  var _operations = {
    getAll: buildDOMCursorAnswer.bind(this),

    save: function(channel, request) {
      var remotePortId = request.remotePortId;
      // Params for the local operation:
      var opData = request.remoteData.data.params || [];
      var reqId = request.remoteData.id;

      var fakeContact = requestOp.params[0];
      var filter = {
        filterBy: ['id'],
        filterValue: fakeContact.id,
        filterOp: 'equals'
      };
      var realContact;

      _contacts.find(filter).then(result => {
        if (!result.length) {
          sendError(channel, request, {name: 'No contacts found'});
          return;
        }
        // Need to update realContact fields
        var updatedContact = _updateContact(result[0], fakeContact);
        _contacts.save(updatedContact).then(result => {
          channel.postMessage({
            remotePortId: remotePortId,
            data: { id : reqId, result: result }
          });
        }).catch(sendError.bind(channel, request));
      }).catch(sendError.bind(channel, request));
    },

    oncontactchange: setHandler.bind(this)
  };

  ['clear', 'find', 'getCount', 'getRevision', 'remove'].forEach(method => {
    _operations[method] = buildDOMRequestAnswer.bind(undefined, method);
  });

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!

  var processSWRequest = function(channel, evt) {
    // We can get:
    // * oncontactchange
    // * getAll
    // * methodName
    var request = evt.data.remoteData;
    var requestOp = request.data.operation;

    debug('processSWRequest --> processing a msg:' +
          (evt.data ? JSON.stringify(evt.data): 'msg without data'));
    if (requestOp in _operations) {
      _operations[requestOp] &&
        _operations[requestOp](channel, evt.data);
    } else {
      console.error('Contacts service unknown operation:' + requestOp);
    }
  };


  // Testing purpose only!!!!
  window.addEventListener('load', function () {
    if (window.ServiceHelper) {
      debug('APP serviceWorker in navigator');
      window.ServiceHelper.register(processSWRequest);
    } else {
      debug('APP navigator does not have ServiceWorker');
      return;
    }
  });

})(window);
