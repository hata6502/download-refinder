const gyazoAccessTokenInputElement = document.querySelector(
  "#gyazo-access-token-input"
);

gyazoAccessTokenInputElement.addEventListener("input", () =>
  chrome.storage.sync.set({
    gyazoAccessToken: gyazoAccessTokenInputElement.value,
  })
);

chrome.storage.sync.get({ gyazoAccessToken: "" }, ({ gyazoAccessToken }) => {
  gyazoAccessTokenInputElement.value = gyazoAccessToken;
});
