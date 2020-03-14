const fs = require('fs');
const url = require('url');
const https = require('https');

if (process.argv.length < 3) {
    console.log(`Usage: node download.js {Video LINK}(You can find Video LINK by Browser.getCurrentVideoID.js)`);
    return;
}

// Default APP ID is 122963
startDownloadByUrl(process.argv[2]);

async function startDownloadByUrl(playerUrl) {
    try {
        var pageData = await getVimeoPage(playerUrl);
        var masterUrl = pageData.masterUrl;
        var courseTitle = pageData.title;
    } catch (e) {
        console.log('Error On video:' + playerUrl);
        console.error(e);
        return;
    }

    if (masterUrl.length === 0) {
        console.log('Error On video:' + playerUrl);
        console.log('Cannot get Master url!');
        return;
    }
    console.log(`Start Process on:` + masterUrl);
    getJson(masterUrl, (err, json) => {
        if (err) {
            throw err;
        }

        const videoData = json.video.pop();
        const audioData = json.audio.pop();

        const videoBaseUrl = url.resolve(url.resolve(masterUrl, json.base_url), videoData.base_url);
        const audioBaseUrl = url.resolve(url.resolve(masterUrl, json.base_url), audioData.base_url);

        processFile('video', videoBaseUrl, videoData.init_segment, videoData.segments, (courseTitle || json.clip_id) + '.m4v', (err) => {
            if (err) {
                throw err;
            }

            processFile('audio', audioBaseUrl, audioData.init_segment, audioData.segments, (courseTitle || json.clip_id) + '.m4a', (err) => {
                if (err) {
                    throw err;
                }
            });
        });
    });

}

async function getVimeoPage(playerUrl) {
    return new Promise(function (resolve, reject) {
        https.get(playerUrl, res => {
            res.setEncoding("utf8");
            let body = "";
            res.on("data", data => {
                body += data;
            });
            res.on("end", () => {
                resolve({
                    masterUrl: findJsonUrl(body),
                    title: findTitle(body)
                });
            });
            res.on('error', (e) => {
                reject(e)
            });
        });
    })
}

// parse main js
function findJsonUrl(str) {
    const regex = /skyfire.vimeocdn(.*?)base64_init=1/gm;
    let res = regex.exec(str);
    if (res !== null) {
        if (typeof res[2] !== "undefined") {
            return 'https://' + res[2];
        }
        if (typeof res[0] !== "undefined") {
            return 'https://' + res[0];
        }
    }
    return '';
}

function findTitle(str) {
    const VIMEO_NAME = "on Vimeo"
    let title = str.match(/<title.*?>(.*)<\/title>/)[1];
    if (title) {
        return title.split(VIMEO_NAME)[0].trim();
    } else {
        return null;
    }
}

function processFile(type, baseUrl, initData, segments, filename, cb) {
    if (fs.existsSync(filename)) {
        console.log(`${type} already exists`);
        return cb();
    }

    const segmentsUrl = segments.map((seg) => baseUrl + seg.url);

    const initBuffer = Buffer.from(initData, 'base64');
    fs.writeFileSync(filename, initBuffer);

    const output = fs.createWriteStream(filename, {
        flags: 'a'
    });

    combineSegments(type, 0, segmentsUrl, output, (err) => {
        if (err) {
            return cb(err);
        }

        output.end();
        cb();
    });
}

function combineSegments(type, i, segmentsUrl, output, cb) {
    if (i >= segmentsUrl.length) {
        console.log(`${type} done`);
        return cb();
    }

    console.log(`Download ${type} segment ${i}`);

    https.get(segmentsUrl[i], (res) => {
        res.on('data', (d) => output.write(d));

        res.on('end', () => combineSegments(type, i + 1, segmentsUrl, output, cb));

    }).on('error', (e) => {
        cb(e);
    });
}

function getJson(url, cb) {
    let data = '';

    https.get(url, (res) => {
        res.on('data', (d) => data += d);

        res.on('end', () => cb(null, JSON.parse(data)));

    }).on('error', (e) => {
        cb(e);
    });
}