/*
 * "owner","name","roles" are required. Everything else is optional. Defaults:
 *
 *   transient: false
 *   Public: false
 *   collaborators: []
 *
 */
const _ = require('lodash');
const utils = require('../../src/server/server-utils');
const fs = require('fs');
const path = require('path');
const PROJECT_DATA_DIR = path.join(__dirname, 'projects');
const DEFAULT_SRC = path.join(PROJECT_DATA_DIR, 'default', 'role-src.xml');
const DEFAULT_MEDIA = path.join(PROJECT_DATA_DIR, 'default', 'role-media.xml');

function loadProjectData(project) {
    let roleNames = project.roles;

    project.roles = {};

    project.roles = roleNames.map(name => {
        let src = fs.readFileSync(DEFAULT_SRC, 'utf8');
        let media = fs.readFileSync(DEFAULT_MEDIA, 'utf8');
        return {
            ProjectName: name,
            SourceCode: src,
            Media: media,
            SourceSize: src.length,
            MediaSize: media.length,
            Thumbnail: utils.xml.thumbnail(src),
            Updated: new Date(),
            Public: false,
            Notes: ''
        };
    });

    return project;
}

function addDefaults(project) {
    project.collaborators = project.collaborators || [];
    project.transient = !!project.transient;
    project.Public = !!project.Public;

    loadProjectData(project);

    return project;
}

module.exports = [
    {
        owner: 'brian',
        name: 'PublicProject',
        Public: true,
        roles: ['role']
    },
    {
        owner: 'brian',
        name: 'MultiRoles',
        roles: ['r1', 'r2', 'r3']
    }
].map(addDefaults);
