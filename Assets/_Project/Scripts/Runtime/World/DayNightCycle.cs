using UnityEngine;

namespace Industria.World
{
    /// <summary>
    /// Slow day / night cycle: sun path, light colour, sky exposure, ambient and fog.
    /// Nights stay readable (blue moonlight) so the player can keep building.
    /// Uses a single directional light (one shadow caster) to stay mobile friendly.
    /// </summary>
    public sealed class DayNightCycle : MonoBehaviour
    {
        public float CycleMinutes = 24f;

        private Light _sun;
        private Material _sky;
        private static readonly int ExposureId = Shader.PropertyToID("_Exposure");
        private static readonly int TintId = Shader.PropertyToID("_SkyTint");

        /// <summary>0..1, 0.25 sunrise, 0.5 noon, 0.75 sunset.</summary>
        public float TimeOfDay { get; set; } = 0.32f;
        public bool Running { get; set; } = true;
        public bool IsNight => TimeOfDay < 0.23f || TimeOfDay > 0.77f;

        public void Init(Light sun)
        {
            _sun = sun;
            // Instance so the Resources asset is never modified in the editor.
            if (RenderSettings.skybox != null)
            {
                _sky = new Material(RenderSettings.skybox) { name = "Sky (instance)" };
                RenderSettings.skybox = _sky;
            }
            Apply();
        }

        private void Update()
        {
            if (Running && CycleMinutes > 0f) TimeOfDay = Mathf.Repeat(TimeOfDay + Time.deltaTime / (CycleMinutes * 60f), 1f);
            Apply();
        }

        public void Apply()
        {
            if (_sun == null) return;
            float angle = (TimeOfDay - 0.25f) * 360f;           // 0 = horizon east, 90 = zenith
            float elevation = Mathf.Sin(angle * Mathf.Deg2Rad);   // -1..1
            float day = Mathf.Clamp01((elevation + 0.08f) / 0.35f);
            float golden = 1f - Mathf.Clamp01(Mathf.Abs(elevation) / 0.35f);

            if (elevation > -0.05f)
            {
                _sun.transform.rotation = Quaternion.Euler(Mathf.Max(angle, 4f) % 360f, -35f, 0f);
                _sun.color = Color.Lerp(new Color(1f, 0.95f, 0.86f), new Color(1f, 0.6f, 0.32f), golden);
                _sun.intensity = Mathf.Lerp(0.3f, 1.3f, day);
            }
            else
            {
                // Moonlight: same light, opposite side of the sky.
                _sun.transform.rotation = Quaternion.Euler(Mathf.Clamp(angle - 180f, 15f, 165f), 145f, 0f);
                _sun.color = new Color(0.55f, 0.66f, 1f);
                _sun.intensity = 0.32f;
            }

            var skyDay = new Color(0.52f, 0.6f, 0.75f);
            var skyNight = new Color(0.16f, 0.2f, 0.34f);
            RenderSettings.ambientSkyColor = Color.Lerp(skyNight, skyDay, day);
            RenderSettings.ambientEquatorColor = Color.Lerp(new Color(0.14f, 0.15f, 0.22f), Color.Lerp(new Color(0.42f, 0.42f, 0.4f), new Color(0.55f, 0.38f, 0.3f), golden * 0.6f), day);
            RenderSettings.ambientGroundColor = Color.Lerp(new Color(0.07f, 0.07f, 0.1f), new Color(0.18f, 0.16f, 0.14f), day);
            var fogDay = Color.Lerp(new Color(0.62f, 0.68f, 0.76f), new Color(0.78f, 0.58f, 0.45f), golden * 0.7f);
            RenderSettings.fogColor = Color.Lerp(new Color(0.08f, 0.1f, 0.16f), fogDay, day);

            if (_sky != null)
            {
                if (_sky.HasProperty(ExposureId)) _sky.SetFloat(ExposureId, Mathf.Lerp(0.18f, 1.15f, day));
                if (_sky.HasProperty(TintId)) _sky.SetColor(TintId, Color.Lerp(new Color(0.3f, 0.35f, 0.6f), new Color(0.55f, 0.6f, 0.72f), day));
            }
        }

        /// <summary>Clock text for the HUD, e.g. "14:30".</summary>
        public string ClockText
        {
            get
            {
                int minutes = Mathf.FloorToInt(TimeOfDay * 24f * 60f);
                return $"{minutes / 60:00}:{minutes % 60:00}";
            }
        }
    }
}
