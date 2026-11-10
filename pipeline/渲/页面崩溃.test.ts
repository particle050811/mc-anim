import { describe, expect, it } from 'vitest';
import { 摘原文 } from './页面崩溃.ts';

describe('摘原文', () => {
  it('从 V8 的 Fatal error 行起摘', () => {
    const 全文 = '[1110/080612.6:ERROR:foo.cc:1] 无关\n#\n# Fatal error in ../../v8/src/objects/js-objects.cc, line 3350\n# Debug check failed: TrustedCast\n#\n';
    expect(摘原文(全文)).toBe('# Fatal error in ../../v8/src/objects/js-objects.cc, line 3350\n# Debug check failed: TrustedCast\n#');
  });
  it('Chromium 的 FATAL 行也算', () => {
    expect(摘原文('[123:456:FATAL:render_frame.cc(10)] Check failed: x.')).toMatch(/^\[123:456:FATAL/);
  });
  it('普通报错不算', () => {
    expect(摘原文('[1110/080612.6:ERROR:base/apple/mach_port_rendezvous_mac.cc:256] bootstrap_look_up\nRuntimeEnabledFeature not recognized')).toBeNull();
  });
});
