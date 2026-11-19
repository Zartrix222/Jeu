using Industria.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace Industria.World
{
    /// <summary>Sun, sky, ambient light and fog for NEXUS-01.</summary>
    public static class EnvironmentSetup
    {
        public static Light Apply(MaterialLibrary materials, Transform parent)
        {
            var sunGo = new GameObject("Soleil");
            sunGo.transform.SetParent(parent, false);
            sunGo.transform.rotation = Quaternion.Euler(42f, -35f, 0f);
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.93f, 0.82f);
            sun.intensity = 1.25f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.85f;
            sun.shadowBias = 0.05f;
            sun.shadowNormalBias = 0.4f;
            RenderSettings.sun = sun;

            var sky = materials.Skybox();
            if (sky != null) RenderSettings.skybox = sky;

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.52f, 0.6f, 0.75f);
            RenderSettings.ambientEquatorColor = new Color(0.42f, 0.42f, 0.4f);
            RenderSettings.ambientGroundColor = new Color(0.18f, 0.16f, 0.14f);

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(0.62f, 0.68f, 0.76f);
            RenderSettings.fogDensity = 0.0023f;
            return sun;
        }
    }
}
