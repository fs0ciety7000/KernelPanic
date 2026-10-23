import { c, pad } from '../ansi';
import type { CommandContext, CommandDef } from '../shell';

function hostInfo(ctx: CommandContext, host: string) {
  return ctx.kernel.bundle.network.hosts?.[host.replace(/^https?:\/\//, '').split(/[/:?]/)[0]!];
}

const ifconfig: CommandDef = {
  name: 'ifconfig',
  summary: 'configure a network interface',
  run(ctx) {
    const ifs = ctx.kernel.bundle.network.interfaces ?? [{ name: 'eth0', ip: ctx.kernel.machine.ip }];
    for (const i of ifs) {
      ctx.out(
        `${i.name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n` +
          `        inet ${i.ip}  netmask ${i.netmask ?? '255.255.255.0'}\n` +
          (i.mac ? `        ether ${i.mac}  txqueuelen 1000  (Ethernet)\n` : '') +
          '\n',
      );
    }
    ctx.out('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n');
    return 0;
  },
};

const ip: CommandDef = {
  name: 'ip',
  summary: 'show routing, devices and tunnels',
  run(ctx) {
    const sub = ctx.argv[0] ?? '';
    const ifs = ctx.kernel.bundle.network.interfaces ?? [{ name: 'eth0', ip: ctx.kernel.machine.ip }];
    if (sub.startsWith('a')) {
      ctx.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n');
      ifs.forEach((i, n) => {
        ctx.out(`${n + 2}: ${i.name}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n`);
        if (i.mac) ctx.out(`    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff\n`);
        ctx.out(`    inet ${i.ip}/24 scope global ${i.name}\n`);
      });
      return 0;
    }
    if (sub.startsWith('r')) {
      const gw = ctx.kernel.machine.ip.replace(/\.\d+$/, '.1');
      ctx.out(`default via ${gw} dev ${ifs[0]?.name ?? 'eth0'} proto dhcp\n${ctx.kernel.machine.ip.replace(/\.\d+$/, '.0')}/24 dev ${ifs[0]?.name ?? 'eth0'} proto kernel scope link src ${ctx.kernel.machine.ip}\n`);
      return 0;
    }
    ctx.err('Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\n       OBJECT := { address | route }\n');
    return 1;
  },
};

const netstat: CommandDef = {
  name: 'netstat',
  summary: 'print network connections',
  run(ctx) {
    const conns = ctx.kernel.bundle.network.connections ?? [];
    ctx.out('Active Internet connections (servers and established)\n');
    ctx.out(`${pad('Proto', 6)}${pad('Local Address', 24)}${pad('Foreign Address', 24)}${pad('State', 13)}PID/Program name\n`);
    for (const x of conns) {
      const prog = ctx.cred.uid === 0 ? (x.program ?? '-') : '-';
      ctx.out(`${pad(x.proto, 6)}${pad(x.local, 24)}${pad(x.remote, 24)}${pad(x.state, 13)}${prog}\n`);
    }
    if (ctx.cred.uid !== 0) ctx.out(c.gray('(Not all processes could be identified, non-owned process info\n will not be shown, you would have to be root to see it all.)\n'));
    return 0;
  },
};

const ping: CommandDef = {
  name: 'ping',
  summary: 'send ICMP ECHO_REQUEST to network hosts',
  run(ctx) {
    const host = ctx.argv.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop();
    if (!host) {
      ctx.err('ping: usage error: Destination address required\n');
      return 1;
    }
    const info = hostInfo(ctx, host);
    if (!info) {
      ctx.err(`ping: ${host}: Temporary failure in name resolution\n`);
      return 2;
    }
    const ipAddr = info.ip ?? '0.0.0.0';
    ctx.out(`PING ${host} (${ipAddr}) 56(84) bytes of data.\n`);
    if (info.reachable === false) {
      ctx.out(`\n--- ${host} ping statistics ---\n4 packets transmitted, 0 received, 100% packet loss, time 3062ms\n`);
      return 1;
    }
    for (let i = 1; i <= 4; i++) ctx.out(`64 bytes from ${ipAddr}: icmp_seq=${i} ttl=57 time=${(11 + i * 0.7).toFixed(1)} ms\n`);
    ctx.out(`\n--- ${host} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss, time 3004ms\n`);
    return 0;
  },
};

const nslookup: CommandDef = {
  name: 'nslookup',
  summary: 'query Internet name servers',
  run(ctx) {
    const host = ctx.argv.find((a) => !a.startsWith('-'));
    if (!host) {
      ctx.err('usage: nslookup HOST\n');
      return 1;
    }
    const info = hostInfo(ctx, host);
    ctx.out(`Server:\t\t10.20.0.53\nAddress:\t10.20.0.53#53\n\n`);
    if (!info?.ip) {
      ctx.out(`** server can't find ${host}: NXDOMAIN\n`);
      return 1;
    }
    ctx.out(`Non-authoritative answer:\nName:\t${host}\nAddress: ${info.ip}\n`);
    return 0;
  },
};

const curl: CommandDef = {
  name: 'curl',
  summary: 'transfer a URL',
  run(ctx) {
    const url = ctx.argv.find((a) => /^(https?:\/\/)?[\w.-]+\.\w+/.test(a) && !a.startsWith('-'));
    if (!url) {
      ctx.err("curl: try 'curl --help' for more information\n");
      return 2;
    }
    const host = url.replace(/^https?:\/\//, '').split(/[/:?]/)[0]!;
    const info = hostInfo(ctx, url);
    if (!info) {
      ctx.err(`curl: (6) Could not resolve host: ${host}\n`);
      return 6;
    }
    if (info.reachable === false || !info.http) {
      ctx.err(`curl: (7) Failed to connect to ${host} port ${url.startsWith('https') ? 443 : 80} after 3071 ms: Couldn't connect to server\n`);
      return 7;
    }
    ctx.out(info.http.replace(/\n?$/, '\n'));
    return 0;
  },
};

const wget: CommandDef = {
  ...curl,
  name: 'wget',
  summary: 'non-interactive network downloader',
  run(ctx) {
    ctx.err('wget: outbound downloads are disabled on this forensic snapshot (egress filtered)\n');
    return 4;
  },
};

const ssh: CommandDef = {
  name: 'ssh',
  summary: 'OpenSSH remote login client',
  run(ctx) {
    const target = ctx.argv.find((a) => !a.startsWith('-'));
    if (!target) {
      ctx.err('usage: ssh [-p port] destination\n');
      return 255;
    }
    const host = target.split('@').pop()!;
    const info = hostInfo(ctx, host);
    if (!info) {
      ctx.err(`ssh: Could not resolve hostname ${host}: Name or service not known\n`);
      return 255;
    }
    ctx.err(`ssh: connect to host ${host} port 22: ${info.reachable === false ? 'Connection timed out' : 'Connection refused'}\n`);
    return 255;
  },
};

export const netCommands: CommandDef[] = [
  ifconfig, ip, netstat, { ...netstat, name: 'ss', hidden: true }, ping, nslookup, { ...nslookup, name: 'host', hidden: true },
  { ...nslookup, name: 'dig', hidden: true }, curl, wget, ssh,
];
