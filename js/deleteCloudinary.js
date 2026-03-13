export async function deleteCloudinaryVideo(publicId) {
  const cloudName = "dvoipiwwn";
  const apiKey = "715984414558243";
  const apiSecret = "ll5bCY7aH7EYwkLNFU1LJcIr5Ec"; // test only
  const timestamp = Math.round(Date.now() / 1000);

  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("signature", signature);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/destroy`,
    {
      method: "POST",
      body: formData,
    },
  );

  const result = await response.json();
  console.log(result);
}

export async function deleteCloudinaryImage(publicId) {
  const cloudName = "dvoipiwwn";
  const apiKey = "715984414558243";
  const apiSecret = "ll5bCY7aH7EYwkLNFU1LJcIr5Ec"; // test only
  const timestamp = Math.round(Date.now() / 1000);

  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("signature", signature);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      method: "POST",
      body: formData,
    },
  );

  const result = await response.json();
  console.log(result);
}
