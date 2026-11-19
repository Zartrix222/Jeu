using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Industria.Rendering
{
    /// <summary>
    /// Creates and caches materials at runtime. Works with URP (preferred) and falls back to the Built-in pipeline.
    /// Template materials stored in Resources/Materials (created by the editor setup) guarantee the shaders
    /// are included in player builds.
    /// </summary>
    public sealed class MaterialLibrary
    {
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");
        private static readonly int MetallicId = Shader.PropertyToID("_Metallic");
        private static readonly int SmoothnessId = Shader.PropertyToID("_Smoothness");
        private static readonly int GlossinessId = Shader.PropertyToID("_Glossiness");
        private static readonly int EmissionColorId = Shader.PropertyToID("_EmissionColor");
        private static readonly int BaseMapId = Shader.PropertyToID("_BaseMap");
        private static readonly int MainTexId = Shader.PropertyToID("_MainTex");

        private readonly Dictionary<string, Material> _cache = new Dictionary<string, Material>();
        private readonly Material _litTemplate;
        private readonly Material _transparentTemplate;

        public bool IsUrp { get; }

        public MaterialLibrary()
        {
            IsUrp = GraphicsSettings.currentRenderPipeline != null;
            _litTemplate = Resources.Load<Material>("Materials/IndustriaLit");
            _transparentTemplate = Resources.Load<Material>("Materials/IndustriaGhost");
            if (_litTemplate == null)
            {
                var shader = Shader.Find(IsUrp ? "Universal Render Pipeline/Lit" : "Standard");
                if (shader == null) shader = Shader.Find("Standard");
                _litTemplate = new Material(shader) { name = "IndustriaLit (runtime)" };
                Debug.LogWarning("[Materials] Resources/Materials/IndustriaLit introuvable : lancez Industria > Configurer le projet. Matériau créé à la volée (OK dans l'éditeur, risque de shader manquant en build).");
            }
            if (_transparentTemplate == null)
            {
                _transparentTemplate = new Material(_litTemplate) { name = "IndustriaGhost (runtime)" };
                MakeTransparent(_transparentTemplate, IsUrp);
            }
        }

        public Material Lit(Color color, float metallic = 0.1f, float smoothness = 0.35f)
        {
            string key = $"lit_{ColorUtility.ToHtmlStringRGBA(color)}_{metallic:F2}_{smoothness:F2}";
            if (_cache.TryGetValue(key, out var mat)) return mat;
            mat = new Material(_litTemplate) { name = key, enableInstancing = true };
            SetColor(mat, color);
            mat.SetFloat(MetallicId, metallic);
            mat.SetFloat(SmoothnessId, smoothness);
            mat.SetFloat(GlossinessId, smoothness);
            _cache[key] = mat;
            return mat;
        }

        public Material Emissive(Color color, Color emission)
        {
            string key = $"emi_{ColorUtility.ToHtmlStringRGBA(color)}_{ColorUtility.ToHtmlStringRGBA(emission)}";
            if (_cache.TryGetValue(key, out var mat)) return mat;
            mat = new Material(_litTemplate) { name = key, enableInstancing = true };
            SetColor(mat, color);
            mat.EnableKeyword("_EMISSION");
            mat.SetColor(EmissionColorId, emission);
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            _cache[key] = mat;
            return mat;
        }

        public Material Textured(string key, Texture2D texture, Color tint, float smoothness = 0.3f)
        {
            if (_cache.TryGetValue(key, out var mat)) return mat;
            mat = new Material(_litTemplate) { name = key, enableInstancing = true };
            SetColor(mat, tint);
            mat.SetTexture(BaseMapId, texture);
            mat.SetTexture(MainTexId, texture);
            mat.SetFloat(SmoothnessId, smoothness);
            mat.SetFloat(GlossinessId, smoothness);
            _cache[key] = mat;
            return mat;
        }

        /// <summary>Semi transparent material used by placement previews.</summary>
        public Material Ghost(Color color)
        {
            string key = $"ghost_{ColorUtility.ToHtmlStringRGBA(color)}";
            if (_cache.TryGetValue(key, out var mat)) return mat;
            mat = new Material(_transparentTemplate) { name = key };
            SetColor(mat, color);
            mat.EnableKeyword("_EMISSION");
            mat.SetColor(EmissionColorId, new Color(color.r, color.g, color.b) * 0.6f);
            _cache[key] = mat;
            return mat;
        }

        public static void SetColor(Material mat, Color color)
        {
            mat.SetColor(BaseColorId, color);
            mat.SetColor(ColorId, color);
        }

        public static void SetTextureOffset(Material mat, Vector2 offset)
        {
            if (mat.HasProperty(BaseMapId)) mat.SetTextureOffset(BaseMapId, offset);
            if (mat.HasProperty(MainTexId)) mat.SetTextureOffset(MainTexId, offset);
        }

        /// <summary>Configures a URP Lit / Standard material for alpha blending.</summary>
        public static void MakeTransparent(Material mat, bool urp)
        {
            if (urp)
            {
                mat.SetFloat("_Surface", 1f);
                mat.SetFloat("_Blend", 0f);
                mat.SetFloat("_AlphaClip", 0f);
                mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                mat.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
                mat.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
                mat.SetFloat("_ZWrite", 0f);
                mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                mat.SetOverrideTag("RenderType", "Transparent");
                mat.SetShaderPassEnabled("ShadowCaster", false);
            }
            else
            {
                mat.SetFloat("_Mode", 3f);
                mat.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                mat.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                mat.SetInt("_ZWrite", 0);
                mat.DisableKeyword("_ALPHATEST_ON");
                mat.EnableKeyword("_ALPHABLEND_ON");
                mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                mat.SetOverrideTag("RenderType", "Transparent");
            }
            mat.renderQueue = (int)RenderQueue.Transparent;
        }

        public Material TerrainMaterial()
        {
            var fromResources = Resources.Load<Material>("Materials/IndustriaTerrain");
            if (fromResources != null) return fromResources;
            var shader = Shader.Find(IsUrp ? "Universal Render Pipeline/Terrain/Lit" : "Nature/Terrain/Standard");
            return shader != null ? new Material(shader) { name = "Terrain (runtime)" } : null;
        }

        public Material Skybox()
        {
            var fromResources = Resources.Load<Material>("Materials/IndustriaSky");
            if (fromResources != null) return fromResources;
            var shader = Shader.Find("Skybox/Procedural");
            if (shader == null) return null;
            var sky = new Material(shader) { name = "Sky (runtime)" };
            ConfigureSky(sky);
            return sky;
        }

        public static void ConfigureSky(Material sky)
        {
            sky.SetFloat("_SunSize", 0.035f);
            sky.SetFloat("_SunSizeConvergence", 6f);
            sky.SetFloat("_AtmosphereThickness", 1.25f);
            sky.SetColor("_SkyTint", new Color(0.55f, 0.6f, 0.72f));
            sky.SetColor("_GroundColor", new Color(0.32f, 0.3f, 0.3f));
            sky.SetFloat("_Exposure", 1.15f);
        }
    }
}
