var dnsd = require('dnsd');
var request = require('request');
var insubnet = require('insubnet');
var argv = require('minimist')(process.argv.slice(2));
var fs = require('fs')
    , Log = require('log')
    , log = new Log('info', fs.createWriteStream('/var/log/edns-wrapper.log'));
var μs = require('microseconds');
var cache = require('memory-cache');
var ip = require('ip');
var saddr = '0.0.0.0';
var sport = 3535;
var queryhost = 'dns.google.com';
var tcache = 600000;
if (argv['h'] === true || argv['help'] === true) {
    console.log('Usage: node[js] app.js [-l <addr>] [-p <port>] [-d <queryhost>] [-t <cachetime(ms)>]');
    console.log('Default Port: 3535');
    console.log('Default Address: 0.0.0.0');
    console.log('Default Queryhost: dns.google.com');
    console.log('Default Cache Time: 600000');
    return;
}
if (argv['l'] && /^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(argv['l'])) {
    saddr = argv['l'];
}
if (argv['p'] && /^\d+$/.test(argv['p'])) {
    sport = argv['p'];
}
if (argv['d'] && /^[\w\.\-:]+$/.test(argv['d'])) {
    queryhost = argv['d'];
}
if (argv['t'] && /^\d+$/.test(argv['t'])) {
    tcache = argv['t'];
}
var typelist = {
    1: 'A',
    28: 'AAAA',
    18: 'AFSDB',
    42: 'APL',
    257: 'CAA',
    60: 'CDNSKEY',
    59: 'CDS',
    37: 'CERT',
    5: 'CNAME',
    49: 'DHCID',
    32769: 'DLV',
    39: 'DNAME',
    48: 'DNSKEY',
    43: 'DS',
    55: 'HIP',
    45: 'IPSECKEY',
    25: 'KEY',
    36: 'KX',
    29: 'LOC',
    15: 'MX',
    35: 'NAPTR',
    2: 'NS',
    47: 'NSEC',
    50: 'NSEC3',
    51: 'NSEC3PARAM',
    12: 'PTR',
    46: 'RRSIG',
    17: 'RP',
    24: 'SIG',
    6: 'SOA',
    33: 'SRV',
    44: 'SSHFP',
    32768: 'TA',
    249: 'TKEY',
    52: 'TLSA',
    250: 'TSIG',
    16: 'TXT',
    256: 'URI',
    252: 'AXFR',
    251: 'IXFR',
    41: 'OPT'
};
var localaddr = '127.0.0.1';
request('https://ipinfo.io', function (error, response, body) {
    if (error) {
        console.log("Get local ip address failed.");
        return;
    }
    try {
        localaddr = JSON.parse(body).ip;
    } catch (e) {
        console.log("Get local ip address failed.");
        return;
    }
});
var server = dnsd.createServer(handler);
server.listen(sport, saddr);
console.log(`Server running at ${saddr}:${sport}`);

function handler(req, res) {
    var tstart = μs.now();
    var question = res.question[0];
    var ocache = cache.get(`${question.type}${question.name}${req.connection.remoteAddress}`);
    if (ocache === null) {
        var remoteaddr = ip.isPrivate(req.connection.remoteAddress) ? localaddr : req.connection.remoteAddress;
        request(`https://${queryhost}/resolve?type=${question.type}&name=${question.name}&edns_client_subnet=${remoteaddr}/24`, function (error, response, body) {
            if (error) {
                res.end();
                return;
            }
            var obody;
            try {
                obody = JSON.parse(body);
                if (!(obody && typeof obody === "object")) {
                    throw ('Parse Error');
                }
            } catch (err) {
                res.end();
                return;
            }
            if (!obody['Answer']) {
                res.end();
                return;
            }
            obody.Answer.forEach(function (ele) {
                var otype = typelist[ele.type];
                if (otype === undefined) {
                    return;
                }
                if (otype !== 'A' && otype !== 'AAAA' && otype !== 'MX' && otype !== 'SOA' && otype !== 'NS' && otype !== 'PTR' && otype !== 'CNAME' && otype !== 'TXT' && otype !== 'SRV' && otype !== 'DS') {
                    return;
                }
                if (otype === 'AAAA') {
                    ele.data = insubnet.Expand(ele.data);
                } else if (otype === 'MX') {
                    ele.data = ele.data.split(' ');
                } else if (otype === 'SOA') {
                    var tmp = ele.data.split(' ');
                    ele.data = {
                        mname: tmp[0],
                        rname: tmp[1],
                        serial: tmp[2],
                        refresh: tmp[3],
                        retry: tmp[4],
                        expire: tmp[5],
                        ttl: tmp[6]
                    };
                } else if (otype === 'SRV') {
                    var tmp = ele.data.split(' ');
                    ele.data = {
                        priority: tmp[0],
                        weight: tmp[1],
                        port: tmp[2],
                        target: tmp[3]
                    };
                } else if (otype === 'DS') {
                    var tmp = ele.data.split(' ');
                    ele.data = {
                        key_tag: tmp[0],
                        algorithm: tmp[1],
                        digest_type: tmp[2],
                        digest: new Buffer(tmp[3], 'hex')
                    };
                }
                res.answer.push({ name: ele.name, type: otype, data: ele.data, 'ttl': ele.ttl });
            });
            cache.put(`${question.type}${question.name}${req.connection.remoteAddress}`, JSON.stringify(res.answer), tcache);
            res.end();
            log.info('%s:%s/%s %s/%s %sms', req.connection.remoteAddress, req.connection.remotePort, req.connection.type, res.question[0].name, res.question[0].type, Math.floor(((μs.now() - tstart) / 1000)).toString());
        });
    } else {
        res.answer = JSON.parse(ocache);
        res.end();
        log.info('%s:%s/%s %s/%s %sms cache', req.connection.remoteAddress, req.connection.remotePort, req.connection.type, res.question[0].name, res.question[0].type, Math.floor(((μs.now() - tstart) / 1000)).toString());
    }
}