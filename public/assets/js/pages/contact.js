import { mountLayout, esc, safeUrl } from '../ui.js';

const { settings } = await mountLayout({ active: 'contact' });
const box = document.getElementById('contact');
const fb = safeUrl(settings.facebookUrl);
const map = 'https://www.google.com/maps?q=' + encodeURIComponent('โรงเรียนชัยนาทพิทยาคม') + '&output=embed';
box.innerHTML = `<dl class="contact-list">
${settings.address ? `<dt>ที่อยู่</dt><dd>${esc(settings.address)}</dd>` : ''}
${settings.phone ? `<dt>โทรศัพท์</dt><dd>${esc(settings.phone)}</dd>` : ''}
${settings.email ? `<dt>อีเมล</dt><dd>${esc(settings.email)}</dd>` : ''}
${fb ? `<dt>Facebook</dt><dd><a href="${esc(fb)}" target="_blank" rel="noopener noreferrer">${esc(fb)}</a></dd>` : ''}
</dl>
<iframe class="map-embed" title="แผนที่โรงเรียนชัยนาทพิทยาคม" src="${esc(map)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
