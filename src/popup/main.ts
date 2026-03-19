import '../popup/styles.css';
import { mountPopup } from './app';

mountPopup({
  document,
  tabsApi: chrome.tabs,
  scriptingApi: chrome.scripting,
  clipboardApi: navigator.clipboard
});
