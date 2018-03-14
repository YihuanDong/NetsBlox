/* eslint-disable no-console */
'use strict';

const isDevEnv = process.env.ENV !== 'production';
var fs = require('fs-extra'),
    path = require('path'),
    srcPath = path.join(__dirname, '..', 'src', 'browser');

// Get the given js files
var devHtml = fs.readFileSync(path.join(srcPath, 'index.dev.html'), 'utf8'),
    re = /text\/javascript" src="(.*)">/,
    match = devHtml.match(re),
    srcFiles = [];

while (match) {
    srcFiles.push(match[1]);
    devHtml = devHtml.substring(match.index + match[0].length);
    match = devHtml.match(re);
}

if (!isDevEnv) console.log('concatting and minifying:', srcFiles);

srcFiles = srcFiles.map(file => path.join(srcPath, file));
var src = srcFiles
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');

var ugly = require('uglify-js');

var final_code = src;

if (isDevEnv) {  // don't minify in dev
    console.log('Dev environment detected - skipping build optimizations. If you ' +
        'change to a production env, be sure to rebuild with:');
    console.log('');
    console.log('    npm run postinstall');
    console.log('');
} else {
    console.log('dev src length:', src.length);

    final_code = ugly.minify(srcFiles, {outSourceMap: path.join(srcPath, 'netsblox-build.js.map')}).code;
    console.log('output length:', final_code.length);
    console.log('compression ratio:', 1-(final_code.length/src.length));
}

const outputPath = path.join(srcPath, 'dist', 'app.min.js');
fs.ensureDir(path.dirname(outputPath))
    .then(() => fs.writeFileSync(outputPath, final_code))
    .catch(err => console.error(err));
/* eslint-enable no-console */
