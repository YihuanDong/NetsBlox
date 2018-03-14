// This is a key value store that can be used across tables
'use strict';

var debug = require('debug'),
    trace = debug('netsblox:rpc:public-roles:trace');

const PublicRoles = {};

/**
 * Get the public role ID for the current role.
 */
PublicRoles.getPublicRoleId = function() {
    var socket = this.socket;

    return this.socket.getRoom().then(room => {
        var owner = room.owner,
            roomName = room.name,
            roleId = socket.role;

        trace(`${this.socket.username} has requested public id`);
        return [
            roleId,
            roomName,
            owner
        ].join('@');
    });
};

/**
 * Get the public role ID for the current role.
 * @deprecated
 */
PublicRoles.requestPublicRoleId = function() {
    return PublicRoles.getPublicRoleId.call(this);
};

module.exports = PublicRoles;
