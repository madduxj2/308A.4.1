import * as Carousel from "./Carousel.js";


// The breed selection input element.
const breedSelect = document.getElementById("breedSelect");
// The information section div element.
const infoDump = document.getElementById("infoDump");
// The progress bar div element.
const progressBar = document.getElementById("progressBar");
// The get favourites button element.
const getFavouritesBtn = document.getElementById("getFavouritesBtn");

// Step 0: Store your API key here for reference and easy access.
const API_KEY = "live_86syEWvAgpLBjFiRMvdLIF6jUyaDoZOvCydDvFvEZsYu4LvTfzRTFHEoRJVQ8ZtA";
const BASE_URL = "https://api.thecatapi.com/v1";

/* ---------------------------
   Helpers
---------------------------- */
function renderBreedInfo(breed) {
  infoDump.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = breed?.name ?? "Unknown breed";

  const desc = document.createElement("p");
  desc.textContent = breed?.description ?? "No description available.";

  const origin = document.createElement("p");
  origin.innerHTML = `<strong>Origin:</strong> ${breed?.origin ?? "N/A"}`;

  const temperament = document.createElement("p");
  temperament.innerHTML = `<strong>Temperament:</strong> ${breed?.temperament ?? "N/A"}`;

  infoDump.append(title, desc, origin, temperament);

  if (breed?.wikipedia_url) {
    const wiki = document.createElement("a");
    wiki.href = breed.wikipedia_url;
    wiki.target = "_blank";
    wiki.rel = "noreferrer";
    wiki.textContent = "Wikipedia";
    infoDump.appendChild(document.createElement("br"));
    infoDump.appendChild(wiki);
  }
}

function clearUI() {
  infoDump.innerHTML = "";
  Carousel.clear();
}

/* ---------------------------
   Part 1+2: FETCH version
---------------------------- */
async function initialLoad() {
  const res = await fetch(`${BASE_URL}/breeds`, {
    headers: { "x-api-key": API_KEY }
  });
  const breeds = await res.json();

  // Populate dropdown
  breedSelect.innerHTML = "";
  for (const b of breeds) {
    const opt = document.createElement("option");
    opt.value = b.id;       // value = id
    opt.textContent = b.name; // text = name
    breedSelect.appendChild(opt);
  }

  // Build initial carousel (first breed)
  if (breeds.length > 0) {
    breedSelect.value = breeds[0].id;
    await handleBreedChangeFetch();
  }
}

async function handleBreedChangeFetch() {
  const breedId = breedSelect.value;

  clearUI();

  // IMPORTANT: limit makes it multiple array items
  const res = await fetch(
    `${BASE_URL}/images/search?breed_ids=${breedId}&limit=10`,
    { headers: { "x-api-key": API_KEY } }
  );
  const images = await res.json();

  // Some breeds might have no images
  if (!Array.isArray(images) || images.length === 0) {
    infoDump.textContent = "No images available for this breed.";
    return;
  }

  // Breed info usually lives on images[0].breeds[0]
  const breed = images?.[0]?.breeds?.[0];
  renderBreedInfo(breed);

  // Build carousel items using your Carousel.js API
  for (const img of images) {
    const src = img.url;
    const alt = breed?.name ? `${breed.name} cat` : "Cat image";
    const id = img.id;

    const itemEl = Carousel.createCarouselItem(src, alt, id);
    Carousel.appendCarousel(itemEl);
  }

  Carousel.start();
}

breedSelect.addEventListener("change", () => {
  handleBreedChangeFetch().catch(console.error);
});

// Run immediately
initialLoad().catch(console.error);

/* ---------------------------
   Part 4-7: AXIOS defaults + interceptors + progress
---------------------------- */
axios.defaults.baseURL = BASE_URL;
axios.defaults.headers.common["x-api-key"] = API_KEY;

function updateProgress(e) {
  console.log("ProgressEvent:", e);

  if (e.lengthComputable) {
    const percent = Math.round((e.loaded / e.total) * 100);
    progressBar.style.width = `${percent}%`;
  } else {
    // total may be unknown for small responses
    progressBar.style.width = "100%";
  }
}

// timing + progress reset + cursor
axios.interceptors.request.use((config) => {
  console.log("Request started:", config.method?.toUpperCase(), config.url);

  config.metadata = { start: performance.now() };

  progressBar.style.width = "0%";
  document.body.style.cursor = "progress";

  return config;
});

axios.interceptors.response.use(
  (response) => {
    const start = response.config.metadata?.start ?? performance.now();
    const ms = performance.now() - start;
    console.log(`Response received in ${ms.toFixed(0)}ms`);

    document.body.style.cursor = "default";
    progressBar.style.width = "100%";

    return response;
  },
  (error) => {
    document.body.style.cursor = "default";
    console.error("Request failed:", error);
    return Promise.reject(error);
  }
);

/* ---------------------------
   Part 8-9: favourites (POST/DELETE toggle) + get favourites
---------------------------- */
async function getFavouritesList() {
  const res = await axios.get("/favourites", {
    onDownloadProgress: updateProgress
  });
  return res.data; // array
}

// Used by Carousel.js when heart is clicked
export async function favourite(imgId) {
  const favourites = await getFavouritesList();
  const existing = favourites.find((f) => f.image_id === imgId);

  if (existing) {
    // delete by favourite id
    await axios.delete(`/favourites/${existing.id}`, {
      onDownloadProgress: updateProgress
    });
    return { action: "deleted", favouriteId: existing.id };
  } else {
    // create favourite
    const res = await axios.post(
      "/favourites",
      { image_id: imgId },
      { onDownloadProgress: updateProgress }
    );
    return { action: "created", favouriteId: res.data?.id };
  }
}

async function getFavourites() {
  clearUI();

  const favourites = await getFavouritesList();

  if (!Array.isArray(favourites) || favourites.length === 0) {
    infoDump.textContent = "No favourites yet. Click the heart on an image to add one!";
    return;
  }

  infoDump.innerHTML = "<h2>Your favourites</h2>";

  for (const fav of favourites) {
    // favourites usually include image.url
    if (fav.image?.url) {
      const src = fav.image.url;
      const alt = "Favourite cat";
      const id = fav.image_id;

      const itemEl = Carousel.createCarouselItem(src, alt, id);
      Carousel.appendCarousel(itemEl);
    } else {
      // fallback: fetch image details
      const imgRes = await axios.get(`/images/${fav.image_id}`, {
        onDownloadProgress: updateProgress
      });

      const src = imgRes.data?.url;
      if (!src) continue;

      const alt = "Favourite cat";
      const id = fav.image_id;

      const itemEl = Carousel.createCarouselItem(src, alt, id);
      Carousel.appendCarousel(itemEl);
    }
  }

  Carousel.start();
}

getFavouritesBtn.addEventListener("click", () => {
  getFavourites().catch(console.error);
});
