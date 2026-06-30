import { browser } from 'wxt/browser';

const footer = document.querySelector<HTMLElement>('.footer');
if (footer) {
  footer.textContent = 'v' + browser.runtime.getManifest().version;
}
