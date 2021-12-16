import filesize from "./filesize.esm.min.js";

const downloadItems = new Map();

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (
    // Reject Data URLs
    downloadItem.url.length >= 1024 ||
    downloadItem.url.startsWith("blob:https://gyazo.com")
  ) {
    return;
  }

  downloadItems.set(downloadItem.id, downloadItem);
});

chrome.downloads.onDeterminingFilename.addListener((partialDownloadItem) => {
  const prevDownloadItem = downloadItems.get(partialDownloadItem.id);

  if (!prevDownloadItem) {
    return;
  }

  const downloadItem = {
    ...prevDownloadItem,
    ...partialDownloadItem,
  };

  downloadItems.set(downloadItem.id, downloadItem);
});

chrome.downloads.onChanged.addListener(async ({ id, ...downloadItemDelta }) => {
  const prevDownloadItem = downloadItems.get(id);

  if (!prevDownloadItem) {
    return;
  }

  const downloadItem = {
    ...prevDownloadItem,
    ...Object.fromEntries(
      Object.entries(downloadItemDelta).map(([key, value]) => [
        key,
        value.current,
      ])
    ),
  };

  downloadItems.set(downloadItem.id, downloadItem);

  if (downloadItem.state !== "complete") {
    return;
  }

  downloadItems.delete(downloadItem.id);

  const thumbnailURL = await getThumbnailURL({ downloadItem });
  const canvasElement = document.createElement("canvas");
  const canvasContext = canvasElement.getContext("2d");
  const imageElement = new Image();

  imageElement.onload = async () => {
    const zoom = Math.max(
      128 / imageElement.naturalWidth,
      128 / imageElement.naturalHeight,
      1
    );

    canvasElement.width = imageElement.naturalWidth * zoom;
    canvasElement.height = imageElement.naturalHeight * zoom + 48;

    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(downloadItem.url)
        )
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // TODO: Windows だとダメかも。
    const shortHash = hash.slice(0, 8);
    const basename = downloadItem.filename.split("/").pop();

    canvasContext.fillStyle = "#ffffff";
    canvasContext.fillRect(0, 0, canvasElement.width, canvasElement.height);
    canvasContext.fillStyle = "#000000";
    canvasContext.font = "14px serif";
    canvasContext.fillText(shortHash, 0, 16);
    canvasContext.fillText(basename, 0, 32);
    canvasContext.drawImage(imageElement, 0, 48);

    canvasElement.toBlob((canvasBlob) => {
      const formData = new FormData();

      chrome.storage.sync.get(
        ["gyazoAccessToken"],
        async ({ gyazoAccessToken }) => {
          if (!gyazoAccessToken) {
            return;
          }

          formData.append("access_token", gyazoAccessToken);
          formData.append("app", "Web Refinder");
          formData.append("imagedata", canvasBlob);
          formData.append("referer_url", downloadItem.url);

          formData.append(
            "desc",
            `${basename}
${downloadItem.url}
${filesize(downloadItem.fileSize)}
`
          );

          const uploadResponse = await fetch(
            "https://upload.gyazo.com/api/upload",
            {
              method: "POST",
              body: formData,
              mimeType: "multipart/form-data",
            }
          );

          if (!uploadResponse.ok) {
            throw new Error(uploadResponse.statusText);
          }
        }
      );
    });
  };

  imageElement.src = thumbnailURL;
});

const getThumbnailURL = async ({ downloadItem }) => {
  try {
    const anyThumbnailResponse = await fetch(
      "https://af36atuifd.execute-api.us-east-1.amazonaws.com/default/any-thumbnail",
      {
        method: "POST",
        body: JSON.stringify({
          url: downloadItem.url,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!anyThumbnailResponse.ok) {
      throw new Error(anyThumbnailResponse.statusText);
    }

    const thumbnailURL = URL.createObjectURL(await anyThumbnailResponse.blob());

    // TODO: URL.revokeObjectURL(thumbnailURL);
    return thumbnailURL;
  } catch (exception) {
    console.error(exception);
  }

  return new Promise((resolve) =>
    chrome.downloads.getFileIcon(downloadItem.id, {}, resolve)
  );
};
