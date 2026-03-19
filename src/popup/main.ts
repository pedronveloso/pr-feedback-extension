import '../popup/styles.css';
import { mountPopup } from './app';

mountPopup({
  document,
  tabsApi: chrome.tabs,
  runtimeApi: chrome.runtime,
  managementApi: chrome.management,
  scriptingApi: chrome.scripting,
  clipboardApi: navigator.clipboard
});
