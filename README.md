# EDNS Wrapper

This is a software provides CDN-friendly dns service, it uses dns.google.com as upstream.

## Install

```
git clone https://github.com/ReinForce-II/edns-wrapper.git
cd edns-wrapper
npm install
node[js] app.js [-l <addr>] [-p <port>] [-d <queryhost>] [-t <cachetime(ms)>]
```

* Default address: 0.0.0.0
* Default Port: 3535
* Default Queryhost: dns.google.com *If you make edns-wrapper as default dns server, you must put your queryhost into hosts
* Default Cache Time: 600000

## Dependencies

* nodejs
* npm