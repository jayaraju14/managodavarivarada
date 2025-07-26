const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
const PORT = process.env.PORT || 8008;

const URL =
  "https://ffs.india-water.gov.in/iam/api/new-entry-data-aggregate/specification/?specification=%7B%22where%22:%7B%22expression%22:%7B%22valueIsRelationField%22:false,%22fieldName%22:%22id.datatypeCode%22,%22operator%22:%22eq%22,%22value%22:%22HHS%22%7D%7D,%22and%22:%7B%22expression%22:%7B%22valueIsRelationField%22:false,%22fieldName%22:%22stationCode.floodForecastStaticStationCode.type%22,%22operator%22:%22eq%22,%22value%22:%22Level%22%7D%7D%7D";

const DATA_FILE = "./data.json";

// Station codes to track
const TARGET_STATION_CODES = ["017-LGDHYD", "028-LGDHYD"];

// Reading stored data
function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const rawData = fs.readFileSync(DATA_FILE);
      return JSON.parse(rawData);
    }
  } catch (err) {
    console.log("Error reading stored data", err.message);
  }
  return null;
}

// Saving the latest filtered data
function saveCurrentData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Fetch and save water level data
async function fetchAndSaveWaterLevel() {
  try {
    const response = await axios.get(URL);
    const allData = response.data;

    const filteredData = allData
      .filter((item) => TARGET_STATION_CODES.includes(item.stationCode))
      .map((item) => {
        let referenceLevel = 0;
        let stationName = "";

        if (item.stationCode === "017-LGDHYD") {
          referenceLevel = 32.6;
          stationName = "Bhadrachalam";
        } else if (item.stationCode === "028-LGDHYD") {
          referenceLevel = 10.67;
          stationName = "Dawaleswaram";
        }

        const diff = item.latestDataValue - referenceLevel;
        const feet = +(diff * 3.28084).toFixed(2);

        return {
          stationCode: item.stationCode,
          stationName: stationName,
          time: item.latestDataTime,
          value_m: item.latestDataValue,
          value_ft: feet,
        };
      });

    saveCurrentData({
      timestamp: new Date().toISOString(),
      stations: filteredData,
    });

    console.log(
      `[${new Date().toLocaleTimeString()}] Saved ${
        filteredData.length
      } station entries`
    );
  } catch (err) {
    console.error("Error fetching water data:", err.message);
  }
}

// API endpoint
app.get("/api/floodReading", async (req, res) => {
  await fetchAndSaveWaterLevel();
  const data = readData();
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ message: "No data available" });
  }
});

// Schedule to run at start of every hour
function scheduleHourlyAtExactTime() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(now.getHours() + 1);

  const delay = nextHour - now;

  console.log(`Next fetch scheduled in ${Math.round(delay / 1000)} seconds`);

  setTimeout(() => {
    fetchAndSaveWaterLevel();
    setInterval(fetchAndSaveWaterLevel, 60 * 60 * 1000); // every 1 hour
  }, delay);
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  //   scheduleHourlyAtExactTime();
});
