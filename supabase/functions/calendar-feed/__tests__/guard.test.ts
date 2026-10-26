/** SSRF guard of the iCal link (D-049): only public HTTPS addresses, whatever the spelling. */
import { checkUrl, isPublicIp, readFeedUrl } from '../guard';

const verdict = (raw: string) => {
  const r = readFeedUrl(raw);
  return r.ok ? 'ok' : r.failure;
};

describe('iCal link guard', () => {
  it('accepts a public HTTPS link, and webcal:// as HTTPS', () => {
    expect(verdict('https://edt.univ-exemple.fr/direct_cal.jsp?data=abc&resources=12')).toBe('ok');
    expect(verdict('  webcal://p01-caldav.icloud.com/published/2/abc  ')).toBe('ok');
    const r = readFeedUrl('webcal://calendar.google.com/calendar/ical/x/basic.ics');
    expect(r.ok && r.url.protocol).toBe('https:');
  });

  it('refuses http, other schemes, credentials, other ports, garbage', () => {
    expect(verdict('http://edt.univ-exemple.fr/cal.ics')).toBe('not_https');
    expect(verdict('ftp://example.com/cal.ics')).toBe('not_https');
    expect(verdict('file:///etc/passwd')).toBe('not_https');
    expect(verdict('javascript:alert(1)')).toBe('not_https');
    expect(verdict('https://user:pass@example.com/cal.ics')).toBe('invalid_url');
    expect(verdict('https://example.com:8443/cal.ics')).toBe('blocked_address');
    expect(verdict('pas un lien')).toBe('invalid_url');
    expect(verdict('')).toBe('invalid_url');
    expect(verdict(`https://example.com/${'a'.repeat(2100)}`)).toBe('invalid_url');
    expect(readFeedUrl(42).ok).toBe(false);
  });

  it.each([
    'https://localhost/cal.ics',
    'https://app.localhost/cal.ics',
    'https://127.0.0.1/cal.ics',
    'https://127.1/cal.ics',
    'https://2130706433/cal.ics',
    'https://0x7f000001/cal.ics',
    'https://0.0.0.0/cal.ics',
    'https://10.1.2.3/cal.ics',
    'https://172.16.0.1/cal.ics',
    'https://172.31.255.255/cal.ics',
    'https://192.168.1.10/cal.ics',
    'https://169.254.169.254/latest/meta-data/',
    'https://100.64.0.1/cal.ics',
    'https://[::1]/cal.ics',
    'https://[::]/cal.ics',
    'https://[fd00::1]/cal.ics',
    'https://[fe80::1]/cal.ics',
    'https://[::ffff:127.0.0.1]/cal.ics',
    'https://[::ffff:a9fe:a9fe]/cal.ics',
    'https://[64:ff9b::a9fe:a9fe]/cal.ics',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://intranet/cal.ics',
    'https://nas.local/cal.ics',
    'https://box.home.arpa/cal.ics',
  ])('blocks %s', (raw) => {
    expect(verdict(raw)).toBe('blocked_address');
  });

  it('classifies resolved addresses', () => {
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5', '2a00:1450:4007:80f::200e'])
      expect([ip, isPublicIp(ip)]).toEqual([ip, true]);
    for (const ip of [
      '10.0.0.1',
      '127.0.0.53',
      '169.254.1.1',
      '192.168.0.1',
      '::1',
      'fd12::1',
      '::ffff:10.0.0.1',
      'not-an-ip',
    ])
      expect([ip, isPublicIp(ip)]).toEqual([ip, false]);
  });

  it('a redirect target is judged the same way', () => {
    expect(checkUrl(new URL('https://169.254.169.254/')).ok).toBe(false);
    expect(checkUrl(new URL('http://example.com/')).ok).toBe(false);
  });
});
