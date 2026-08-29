/**
 * Core alert logic.
 */
import { evaluate, evaluateAsync, getClient } from '../connection.js';

export async function create({ condition, price, message }) {
  const opened = await evaluate(`
    (function() {
      var btn = document.querySelector('[aria-label="Create Alert"]')
        || document.querySelector('[data-name="alerts"]');
      if (btn) { btn.click(); return true; }
      return false;
    })()
  `);

  if (!opened) {
    const client = await getClient();
    await client.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 1, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA' });
  }

  await new Promise(r => setTimeout(r, 1200));

  // NOTE: TradingView's dialog now uses hashed CSS-module class names
  // (e.g. "input-H0xdCnFS") with no literal "alert" substring anywhere,
  // so the old `[class*="alert"] input[...]` selectors always matched zero
  // elements. Instead: while the Create Alert dialog is open, it's the only
  // visible text input on the page, so target it directly by that property.
  const priceSet = await evaluate(`
    (function() {
      var inputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(function(i) {
        var r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      // Prefer one whose current value already looks like a price (has a decimal/comma),
      // matching the alert dialog's auto-filled Value field. Fall back to the only candidate.
      var target = inputs.find(function(i) { return /^[\\d,]+\\.?\\d*$/.test(i.value.trim()); }) || inputs[0];
      if (!target) return false;
      var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(target, '${price}');
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `);

  if (message) {
    await evaluate(`
      (function() {
        // The Message field starts collapsed as a one-line summary
        // ("<symbol> Crossing <price>") — click it to reveal the real textarea.
        var summary = Array.from(document.querySelectorAll('span,div')).find(function(el) {
          var t = (el.textContent || '').trim();
          return t.length > 0 && t.length < 80 && /crossing|greater than|less than/i.test(t)
            && el.children.length === 0;
        });
        if (summary) summary.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 300));
    await evaluate(`
      (function() {
        var textarea = Array.from(document.querySelectorAll('textarea')).find(function(t) {
          var r = t.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (textarea) {
          var nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          nativeSet.call(textarea, ${JSON.stringify(message)});
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
  }

  await new Promise(r => setTimeout(r, 500));
  const created = await evaluate(`
    (function() {
      var btns = document.querySelectorAll('button[data-name="submit"], button');
      for (var i = 0; i < btns.length; i++) {
        if (/^create$/i.test(btns[i].textContent.trim())) { btns[i].click(); return true; }
      }
      return false;
    })()
  `);

  return { success: !!created, price, condition, message: message || '(none)', price_set: !!priceSet, source: 'dom_fallback' };
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all }) {
  if (delete_all) {
    const result = await evaluate(`
      (function() {
        var alertBtn = document.querySelector('[data-name="alerts"]');
        if (alertBtn) alertBtn.click();
        var header = document.querySelector('[data-name="alerts"]');
        if (header) {
          header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
          return { context_menu_opened: true };
        }
        return { context_menu_opened: false };
      })()
    `);
    return { success: true, note: 'Alert deletion requires manual confirmation in the context menu.', context_menu_opened: result?.context_menu_opened || false, source: 'dom_fallback' };
  }
  throw new Error('Individual alert deletion not yet supported. Use delete_all: true.');
}
