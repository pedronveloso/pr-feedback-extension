import '../popup/styles.css';
import { mountPopup } from './app';

mountPopup({
  document,
  tabsApi: chrome.tabs,
  clipboardApi: navigator.clipboard
});
