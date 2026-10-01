# installed panda and pyarrow
import pandas as pd

FILANAME = "airquality.no2.o3.so2.pm10.pm2p5_4.annual_pnt_20150101_20231231_eu_epsg.3035_v20240718.parquet"
OUTPUT_FILENAME = "air_quality_annual_viz.csv"


df = pd.read_parquet(FILANAME)

# columns used for visualization
cols_viz = [
    "Air.Quality.Station.EoI.Code",
    "Countrycode",
    "Longitude",
    "Latitude",
    "Station.Type",
    "Station.Area",
    "year",
    "NO2"
]

df_viz = df[cols_viz].copy()


# just in case, drop rows with missing critical data
df_viz = df_viz.dropna(
    subset=["Longitude", "Latitude", "NO2"]
)

# rename columns for convenience
df_viz = df_viz.rename(columns={
    "Air.Quality.Station.EoI.Code": "station_id",
    "Countrycode": "country",
    "Longitude": "lon",
    "Latitude": "lat",
    "Station.Type": "station_type",
    "Station.Area": "station_area"
})


# ensure correct data types (VERY IMPORTANT)
df_viz["year"] = df_viz["year"].astype(int)
df_viz["NO2"] = df_viz["NO2"].astype(float)
df_viz["lon"] = df_viz["lon"].astype(float)
df_viz["lat"] = df_viz["lat"].astype(float)


# quick sanity check: print basic info (shape, columns, dtypes, missing values (zero expected after dropna))
print("Final shape:", df_viz.shape)
print("Years:", df_viz["year"].min(), "-", df_viz["year"].max())
print("Stations:", df_viz["station_id"].nunique())
print("Countries:", df_viz["country"].nunique())

print("\nMissing values:")
print(df_viz.isna().sum())


# save to CSV
df_viz.to_csv(
    OUTPUT_FILENAME,
    index=False
)
