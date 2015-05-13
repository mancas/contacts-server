(function(window) {
  'use strict';

  function debug(str) {
    console.log('MANU ContactsService -*-:' + str);
  }

  // Ok, this kinda sucks because most APIs (and settings is one of them) cannot
  // be accessed from outside the main thread. So basically everything has to go
  // down to the SW thread, then back up here for processing, then back down to
  // be sent to the client. Yay us!
  var _observers = {};

  var processSWRequest = function(channel, evt) {

    var _contacts = navigator.mozContacts;
    // We can get:
    // * oncontactchange
    // * getAll
    // * methodName
    var remotePortId = evt.data.remotePortId;
    var request = evt.data.remoteData;
    var requestOp = request.data;

    var specialFields = ['published', 'updated', 'bday',
      'anniversary', 'photo'];

    function _cloneObject(obj) {
      var cloned = {};
      for (var key in obj) {
        if (specialFields.indexOf(key) !== -1) {
          cloned[key] = _processSpecialFields(obj, key);
          continue;
        }

        if (typeof obj[key] === 'object') {
          cloned[key] = _cloneObject(obj[key]);
          continue;
        }

        if (typeof obj[key] !== 'function' || obj[key] === null) {
          cloned[key] = obj[key];
        }
      }
      return cloned;
    }

    function _processSpecialFields(realObj, field) {
      if (field === 'photo') {
        return realObj[field];
      }
      return realObj[field] !== null ? realObj[field].toJSON() : null;
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
      var cursor = _contacts.getAll.apply(_contacts, requestOp.params);
      var contacts = [];

      cursor.onsuccess = () => {
        var contact = cursor.result;
        // 'cursor.done' flag should be activated when the last file is
        // reached. However, it seems that the flag is only is enabled in 
        // the next iteration so we've always got an undefined file
        if (typeof contact !== 'undefined') {
          contacts.push(contact);
        }

        if (!cursor.done) {
          cursor.continue();
        } else {
          console.info(contacts);
          console.info(_cloneObject(contacts[0]));
          // Send message
          channel.postMessage({
            remotePortId: remotePortId,
            data: { id : request.id, result: contacts }}
          );
        }
      };

      cursor.onerror = () => {
        channel.postMessage({
          remotePortId: remotePortId,
          data: { id : request.id, error: cursor.error }}
        );
      };
    } else {
      _contacts[requestOp.operation].apply(_contacts, requestOp.params).
        then(result => {
          channel.postMessage({
            remotePortId: remotePortId,
            data: { id : request.id, result: result}}
          );
      }).catch(error => {
        channel.postMessage({
          remotePortId: remotePortId,
          data: { id : request.id, error: error.name}}
        );
      });
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
