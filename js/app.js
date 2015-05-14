(function(window) {
  'use strict';

  function debug(str) {
    console.log('MANU ContactsService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!

  var processSWRequest = function(channel, evt) {

    var _contacts = navigator.mozContacts;
    // We can get:
    // * oncontactchange
    // * getAll
    // * methodName
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    function _cloneContact(mozContact) {
      var cloned = {};
      for (var key in mozContact) {
        if (typeof mozContact[key] === 'object') {
          cloned[key] = mozContact[key];
          continue;
        }

        if (typeof mozContact[key] !== 'function') {
          cloned[key] = mozContact[key];
        }
      }
      return cloned;
    }

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

    function sendError(error) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: { id : request.id, error: error.name }}
      );
    }

    function sendResult(result) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: { id : request.id, result: result }}
      );
    }

    function listenerTemplate(evt) {
      channel.postMessage({
        remotePortId: remotePortId,
        data: {
          id: request.id,
          event: {
            contactID: evt.contactID,
            reason: evt.reason
          }
        }
      });
    }

    if (requestOp.operation === 'oncontactchange') {
      _contacts.oncontactchange = listenerTemplate;
    } else if (requestOp.operation === 'getAll') {
      var cursor = _contacts.getAll(..requestOp.params);
      var contacts = [];

      cursor.onsuccess = () => {
        var contact = cursor.result;
        // 'cursor.done' flag should be activated when the last file is
        // reached. However, it seems that the flag is only is enabled in 
        // the next iteration so we've always got an undefined file
        if (typeof contact !== 'undefined') {
          contacts.push(window.ServiceHelper.cloneObject(contact));
        }

        if (!cursor.done) {
          cursor.continue();
        } else {
          // Send message
          sendResult(contacts);
        }
      };

      cursor.onerror = () => {
        sendError(cursor.error);
      };
    } else if (requestOp.operation === 'save') {
      var fakeContact = requestOp.params[0];
      var filter = {
        filterBy: ['id'],
        filterValue: fakeContact.id,
        filterOp: 'equals'
      };
      var realContact;

      _contacts.find(filter).then(result => {
        if (!result.length) {
          sendError({ name: 'No contacts found' });
          return;
        }
        // Need to update realContact fields
        var updatedContact = _updateContact(result[0], fakeContact);
        _contacts.save(updatedContact).then(sendResult).catch(sendError);
      }).catch(sendError);
    } else {
      _contacts[requestOp.operation](...requestOp.params).
        then(sendResult).catch(sendError);
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
