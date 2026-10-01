# installed panda and pyarrow
import pandas as pd


df = pd.read_parquet("airquality.no2.o3.so2.pm10.pm2p5_4.annual_pnt_20150101_20231231_eu_epsg.3035_v20240718.parquet")


# columns needed for visualization
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

# rename columns for clarity
df_viz = df_viz.rename(columns={
    "Air.Quality.Station.EoI.Code": "station_id",
    "Countrycode": "country",
    "Longitude": "lon",
    "Latitude": "lat",
    "Station.Type": "station_type",
    "Station.Area": "station_area"
})


# ensure correct data types
df_viz["year"] = df_viz["year"].astype(int)
df_viz["NO2"] = df_viz["NO2"].astype(float)
df_viz["lon"] = df_viz["lon"].astype(float)
df_viz["lat"] = df_viz["lat"].astype(float)


# Sanity check: print basic info (shape, columns, dtypes, missing values (zero expected after dropna))
print("Final shape:", df_viz.shape)
print("Years:", df_viz["year"].min(), "-", df_viz["year"].max())
print("Stations:", df_viz["station_id"].nunique())
print("Countries:", df_viz["country"].nunique())

print("\nMissing values:")
print(df_viz.isna().sum())


# Save to CSV
df_viz.to_csv(
    "air_quality_annual_viz.csv",
    index=False
)



exit()


### AFTER THIS POINT, THIS IS JUST EXPLORATORY DATA ANALYSIS (EDA) CODE ###


### The annual and monthly files use a 75% coverage threshold—meaning if a station was offline for more than 25% of the time, the aggregate for that period is discarded to avoid bias.
### Gapfilling (PM2.5): The dataset uses a linear regression model (Horálek et al., 2023) to estimate PM2.5 levels at stations where only PM10 is measured.


### coverage They represent the fraction of valid measurements collected by a sensor over the course of a year.


cols = [
    "Air.Quality.Station.EoI.Code", # unique station id
    "Countrycode", # country code (for grouping and filtering)
    
    # geographic context
    "Longitude", # x geographic coordinates
    "Latitude",  # y geographic coordinates
    
    # station context
    "Station.Type", # traffic vs background comparison (Red for Traffic, Green for Background)
    "Station.Area", # urban vs rural comparison

    # temporal context
    "year", # temporal filtering, slider


    # Core Pollutants (Mapping Optimized)
    "NO2",             # traffic signal (Arithmetic Mean. Highly correlated with urban traffic; levels drop sharply away from roads)
    "PM10_90.41",      # coarse particles (90.41th Percentile. This corresponds to the 36th highest day of the year, directly mapping to the EU daily limit (which allows 35 exceedance days))
    # "O3_max8h_93.15",  # ground-level ozone (93.15th Percentile. Calculated from the maximum 8-hour daily mean. This captures peak summer concentrations rather than the average)
    "PM2.5",           # fine particles (Gap-filled Mean. Since PM2.5 sensors are sparse, missing values were modeled using PM10 data )
    # "SO2",            # sulfur dioxide (Arithmetic Mean. Primarily a marker for industrial activity and heavy shipping; levels tend to be lower in urban areas compared to NO2 and PM10)
]


## 
## Station.Type: Use "Background" as your baseline and "Traffic" or "Industrial" as your "signal" for local pollution
## Station.Area: Use "Urban" vs "Rural" to explain why Ozone (O3) is often higher in the countryside (where it isn't "titrated" by city NO2) compared to urban centers.


## PM2.5 (Fine): These are small enough to pass through the lungs directly into the bloodstream. They are the primary cause of long-term cardiovascular and respiratory diseases.
## Combustion (Car engines, wood burning, industry)
## High PM2.5 at a Traffic station indicates heavy exhaust emissions

## PM2.5 is more "transboundary"—it can stay in the air for days and travel hundreds of kilometers. This means a Background station and a Traffic station in the same city might have very similar PM2.5 levels (the "regional background"

## PM10 (Coarse): These generally get trapped in the upper respiratory tract (nose and throat). While still harmful, they are more associated with asthma and localized irritation
## Mechanical (Brake/tire wear, road dust, construction, sea salt)
## High PM10 at a Rural station might just be wind-blown dust or salt, not necessarily man-made pollution

## NO2 and PM10 are often much higher at the Traffic station than the Background station because they settle or react much faster.


# Show basic info
print("Shape:", df.shape)
print("\nColumns:", df.columns.tolist())
print("\nData types:")
print(df.dtypes)

# Show a few rows
print("\nFirst 10 rows:")
with pd.option_context('display.max_columns', None, 'display.width', 1000):
    print(df[cols].head(10))

# Show basic stats for numeric columns
print("\nNumeric stats (describe):")
print(df[cols].describe())

# Columns whose dtype is not numeric (object, string, etc.)
print("\nNon-numeric columns:")
non_numeric_cols = df[cols].select_dtypes(exclude=["number"]).columns
print(non_numeric_cols.tolist())

# Quick peek at their values
for c in non_numeric_cols:
    print(f"\nColumn: {c}")
    print(df[c].value_counts(dropna=False).head(50))  # top 50 most common values


print("\n")
# 1) Full-row duplicates
n_dup_all = df.duplicated().sum()
print("Duplicate rows (all columns identical):", n_dup_all)

# 2) Duplicates per station–country–year
key_cols = ["Air.Quality.Station.EoI.Code", "Countrycode", "year"]
n_dup_key = df[key_cols].duplicated().sum()
print("Duplicates by station+country+year:", n_dup_key)

# # Inspect some duplicate keys if they exist
# dups = df[df[key_cols].duplicated(keep=False)].sort_values(key_cols)
# print(dups.head(20))


print("\nMissing values analysis:")
# NaN counts per column
print(df.isna().sum())

# Fraction of missing values per column
print("\nPercentage of missing values per column:")
print((df.isna().mean() * 100).round(2))

# Example: rows where any core pollutant is missing
core_pollutants = ["NO2", "PM10_90.41", "PM2.5"]
nan_core = df[df[core_pollutants].isna().any(axis=1)]
print("\nRows with at least one core pollutant NaN:")
print(nan_core[cols].head())



group_cols = ["Station.Type", "Station.Area", "Countrycode", "year"]

common = (
    df[group_cols]
    .value_counts(dropna=False)
    .head(20)
)

print(common)


# Total rows and columns
print("\nShape (rows, columns):", df.shape)

# Number of distinct stations, countries, years
print("Unique stations:", df["Air.Quality.Station.EoI.Code"].nunique())
print("Unique countries:", df["Countrycode"].nunique())
print("Unique years:", df["year"].nunique())


# Rows per country
print("\nRows per country:")
print(df["Countrycode"].value_counts().sort_index())

# Rows per year
print("\nRows per year:")
print(df["year"].value_counts().sort_index())

# Country–year matrix (how balanced is coverage over time per country)
print("\nRows per country-year:")
country_year = df.groupby(["Countrycode", "year"]).size().unstack(fill_value=0)
print(country_year)


# How many years of data per station
years_per_station = df.groupby("Air.Quality.Station.EoI.Code")["year"].nunique()

print("\nYears of data per station (summary):")
print(years_per_station.describe())

# Add the median as a single number
median_years = years_per_station.median()
print(f"\nMedian years of data per station: {median_years}")

# Example: stations with very short timeseries (possible bias)
short_stations = years_per_station[years_per_station <= 2]
print("\nStations with ≤ 2 years of data:", short_stations.shape[0])



common_df = common.reset_index(name="count")
print("\nMost common combinations (Station.Type, Station.Area, Country, year):")
print(common_df)


# Overall counts per station type
print("\nRows per Station.Type:")
print(df["Station.Type"].value_counts(dropna=False))

# Overall counts per Station.Area
print("\nRows per Station.Area:")
print(df["Station.Area"].value_counts(dropna=False))

# Type–area–country aggregation
type_area_country = df.groupby(["Station.Type", "Station.Area", "Countrycode"]).size()
print("\nRows per Station.Type–Station.Area–Country:")
print(type_area_country.sort_values(ascending=False).head(30))


# TODO NaN handling


# df_selected = df_selected.dropna(subset=["Longitude", "Latitude", "NO2", "PM2.5"])
# df_selected.to_csv("eea_air_quality_annual_2023.csv", index=False)



# at the end, the main topic of Visualization is 
# How NO₂ pollution varies by station type, location, and time across Europe.

# This naturally uses:
# geography
# categories
# time
# comparisons






