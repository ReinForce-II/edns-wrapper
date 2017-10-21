var dnsd = require('dnsd');
var request = require('request');
var insubnet = require('insubnet');
var argv = require('minimist')(process.argv.slice(2));
var μs = require('microseconds');
var cache = require('memory-cache');
var ip = require('ip');
var dns = require('native-dns');
var os = require('os'),
    ifaces = os.networkInterfaces();
var saddr = '0.0.0.0';
var sport = [ 3535 ];
var queryhost = 'dns.google.com';
var tcache = 600000;
var log_query = false;
if (argv['h'] === true || argv['help'] === true) {
    console.log('Usage: node[js] app.js [-l <addr>] [-p <port>] [-d <queryhost>] [-t <cachetime(ms)>] [-D]');
    console.log('Default Port: 3535');
    console.log('Default Address: 0.0.0.0');
    console.log('Default Queryhost: dns.google.com');
    console.log('Default Cache Time: 600000');
    console.log('Default No Log Query');
    process.exit();
}
if (argv['l'] && /^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(argv['l'])) {
    saddr = argv['l'];
}
if ((typeof argv['p']) === 'number') {	
    sport = [argv['p']];
}
else if ((typeof argv['p']) === 'object') {
	sport = argv['p'];
}
if (argv['d'] && /^[\w\.\-:]+$/.test(argv['d'])) {
    queryhost = argv['d'];
}
if (argv['t'] && /^\d+$/.test(argv['t'])) {
    tcache = argv['t'];
}
if (argv['D']) {
    log_query = true;
}
var fs = require('fs')
    , Log = require('log')
    , log = new Log('info', fs.createWriteStream(`/var/log/edns-wrapper.log`, { flags: 'a' }))
    , plog = new Log('info', fs.createWriteStream(`/var/log/edns-wrapper.p.log`, { flags: 'a' }));
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

dns.platform.name_servers = [
    { address: '8.8.8.8', port: 53 },
    { address: '8.8.4.4', port: 53 },
    { address: '114.114.114.114', port: 53 },
    { address: '119.119.119.119', port: 53 }
];
function getqhost() {
    dns.resolve4(/^[\w\.\-]+/.exec(queryhost)[0], (err, addresss) => {
        if (err) {
            console.log('Get queryhost address failed.');
            plog.info('Get queryhost address failed.');
            setTimeout(getqhost, 3000);
            return;
        } else {
            try {
                var chosts = fs.readFileSync('/etc/hosts', 'utf-8');
                var qhost = /^[\w\.\-]+/.exec(queryhost)[0];
                tqhost = qhost.replace(/\./g, '\\.');
                tqhost = tqhost.replace(/\-/g, '\\-');
                var rrtqhost = '[ \\t]' + tqhost + '[ \\t\\n$]';
                var rtqhost = new RegExp(rrtqhost);
                if (rtqhost.test(chosts)) {
                    rrtqhost = '[\^n].*' + tqhost + '.*[\n$]';
                    rtqhost = new RegExp(rrtqhost);
                    chosts = chosts.replace(rtqhost, `\n${addresss[0]} ${qhost}\n`);
                }
                else {
                    chosts += `\n${addresss[0]} ${qhost}\n`;
                }
                fs.writeFileSync('/etc/hosts', chosts, 'utf-8');

                getlocaladdr();
                if (saddr === '0.0.0.0') {
                    Object.keys(ifaces).forEach(function (ifname) {
                        ifaces[ifname].forEach(function (iface) {
                            if ('IPv4' !== iface.family) {
                                // skip over non-ipv4 addresses
                                return;
                            }
                            sport.forEach((port) => {
								var server = dnsd.createServer(handler);
								server.listen(port, iface.address);
								console.log(`Server running at ${iface.address}:${port}`);
								plog.info(`Server running at ${iface.address}:${port}`);
                            });
                        });
                    });
                } else {
                    sport.forEach((port) => {
						var server = dnsd.createServer(handler);
						server.listen(port, saddr);
						console.log(`Server running at ${saddr}:${port}`);
						plog.info(`Server running at ${saddr}:${port}`);
                    });
                }
            } catch (e) {
                console.log('Edit /etc/hosts failed.');
                plog.info('Edit /etc/hosts failed.');
                return;
            }
        }
    });
}
getqhost();
var localaddr = '127.0.0.1';
function getlocaladdr() {
    request({
        url: 'http://209.58.164.148/json',  /* http://ip-api.com/json 209.58.164.148 209.58.164.112 */
        gzip: true,
        timeout: 5000
    }, function (error, response, body) {
        if (error) {
            setTimeout(getlocaladdr, 3000);
            console.log(`Get local address failed, retry after 3000ms`);
            plog.info(`Get local address failed, retry after 3000ms`);
            return;
        }
        try {
            localaddr = JSON.parse(body).query;
            console.log(`Local address is ${localaddr}`);
            plog.info(`Local address is ${localaddr}`);
        } catch (e) {
            setTimeout(getlocaladdr, 3000);
            console.log(`Get local address failed, retry after 3000ms`);
            plog.info(`Get local address failed, retry after 3000ms`);
            return;
        }
    });
}



function handler(req, res) {
    var tstart = μs.now();
    var question = res.question[0];
    var ocache = cache.get(`${question.type}${question.name}${req.connection.remoteAddress}`);
    if (ocache === null) {
        var remoteaddr = ip.isPrivate(req.connection.remoteAddress) || ip.cidrSubnet('10.0.0.0/8').contains(req.connection.remoteAddress) || ip.cidrSubnet('100.64.0.0/10').contains(req.connection.remoteAddress) || ip.cidrSubnet('169.254.0.0/16').contains(req.connection.remoteAddress) || ip.cidrSubnet('172.16.0.0/12').contains(req.connection.remoteAddress) || ip.cidrSubnet('192.168.0.0/16').contains(req.connection.remoteAddress) ? localaddr : req.connection.remoteAddress;
        request({
            url: `https://${queryhost}/resolve?type=${question.type}&name=${question.name}&edns_client_subnet=${remoteaddr}/24`,
            gzip: true
        }, function (error, response, body) {
            if (error) {
                res.end();
                log.info('[Failed] %s:%s/%s %s/%s %s', remoteaddr, req.connection.remotePort, req.connection.type, res.question[0].name, res.question[0].type, error);
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
                if (body['Authority'] && obody['Authority'].length > 0) {
                    obody.Answer = obody.Authority;
                } else {
                    res.end();
                    return;
                }
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
            if (localaddr !== '127.0.0.1') {
                cache.put(`${question.type}${question.name}${req.connection.remoteAddress}`, JSON.stringify(res.answer), tcache);
            }
            res.end();
            if (log_query) {
                log.info('%s:%s/%s %s/%s %sms', remoteaddr, req.connection.remotePort, req.connection.type, res.question[0].name, res.question[0].type, Math.floor(((μs.now() - tstart) / 1000)).toString());
            }
        });
    } else {
        res.answer = JSON.parse(ocache);
        res.end();
        if (log_query) {
            log.info('%s:%s/%s %s/%s %sms cache', req.connection.remoteAddress, req.connection.remotePort, req.connection.type, res.question[0].name, res.question[0].type, Math.floor(((μs.now() - tstart) / 1000)).toString());
        }
    }
}
