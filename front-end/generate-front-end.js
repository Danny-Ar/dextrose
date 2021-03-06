const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const pug = require('pug');
const log = require('../lib/logger').default;

module.exports = (bucket, commitHash, opts) => {
  AWS.config.update({
    region: opts.region
  });
  const s3 = new AWS.S3();

  s3.listObjects({
    Bucket: bucket,
    Prefix: commitHash
  }, (s3Error, s3Data) => {
    if (s3Error) {
      log.error('generate-front-end', s3Error);
    };

    const names = [];
    const shots = s3Data.Contents.reduce((collection, details) => {
      const url = `${s3.endpoint.href}${bucket}/${details.Key}`;

      if (!url.includes('.png')) {
        return collection;
      }

      const storyDetails = url.match(
        /(.*)\.(android|ios|web).?(.*).png/);
      const storyURL = storyDetails[1].split('/');
      const storyName = storyURL[storyURL.length - 1];
      const platform = storyDetails[2];
      const width = storyDetails[3];

      if (!collection[storyName]) {
        names.push(storyName);
        collection[storyName] = {}; // eslint-disable-line no-param-reassign
      }

      if (platform === "web") {
        collection[storyName][platform] = collection[storyName][
          platform
        ] ? collection[storyName][platform] : {};
        collection[storyName][platform][width] = url;
      } else {
        collection[storyName][platform] = url; // eslint-disable-line no-param-reassign
      }

      return collection;
    }, {});

    let dextrosePresentation;


    if (!Object.entries(shots)[0]) {
      log.info('generate-front-end', 'no shots exist');
      const templatePath = path.join(__dirname, 'no-snap-template.pug');
      const compileTemplate = pug.compileFile(templatePath);
      dextrosePresentation = compileTemplate();

    } else {

      const firstShot = Object.entries(shots)[0][1];
      let widths = [];

      if (firstShot.web) {
        const webWidths = firstShot.web;
        widths = Object.keys(webWidths).sort((a, b) => parseInt(a.split(
          '-')[1]) > parseInt(b.split('-')[1]));
      }

      const templatePath = path.join(__dirname, 'snap-template.pug');
      const compileTemplate = pug.compileFile(templatePath);

      dextrosePresentation = compileTemplate({
        names,
        shots,
        widths,
      });
    }

    const pagePath = path.join(__dirname, 'index.html');

    fs.writeFile(pagePath, dextrosePresentation, (writeErr) => {
      if (writeErr) {
        log.error('generate-front-end', writeErr);
        return;
      }

      const fileStream = fs.createReadStream(pagePath);

      fileStream.on('error', (streamErr) => {
        log.error('generate-front-end', streamErr);
      });

      const uploadParams = {
        Bucket: bucket,
        Key: `${commitHash}/index.html`,
        Body: fileStream,
        ContentType: 'text/html',
      };

      s3.putObject(uploadParams, (uploadErr, uploadData) => {
        if (uploadErr) {
          log.error('generate-front-end', uploadErr);
        }
        if (uploadData) {
          log.info('generate-front-end',
            'Uploaded index.html successfully');
        }
      });
    });
  });
};
