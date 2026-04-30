import { describe, expect, it } from "vitest";
import { getWeatherInfo } from "@/utils/weatherCodes";

describe("weather code presentation", () => {
  it("uses night icons and cool color role for clear and partly cloudy night", () => {
    expect(getWeatherInfo(0, false)).toMatchObject({ icon: "Moon", colorRole: "night" });
    expect(getWeatherInfo(1, false)).toMatchObject({ icon: "CloudMoon", colorRole: "night" });
    expect(getWeatherInfo(2, false)).toMatchObject({ icon: "CloudMoon", colorRole: "night" });
  });

  it("keeps daytime sun/cloud icons for clear and partly cloudy day", () => {
    expect(getWeatherInfo(0, true)).toMatchObject({ icon: "Sun", colorRole: "sun" });
    expect(getWeatherInfo(1, true)).toMatchObject({ icon: "CloudSun", colorRole: "sun" });
    expect(getWeatherInfo(2, true)).toMatchObject({ icon: "CloudSun", colorRole: "cloud" });
  });
});
