using UnityEngine;
#if INDUSTRIA_URP
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
#endif

namespace Industria.Rendering
{
    /// <summary>
    /// Cinematic but cheap post-processing (URP only): ACES tonemapping, bloom on emissive parts,
    /// light colour grading and vignette, plus FXAA/SMAA. Does nothing with the Built-in pipeline.
    /// </summary>
    public static class PostProcessing
    {
        public static void Setup(Camera camera, Transform parent, bool mobile)
        {
#if INDUSTRIA_URP
            if (!(GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset)) return;

            var data = camera.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.antialiasing = mobile ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            data.renderShadows = true;

            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            profile.name = "Industria Post";

            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);

            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(1.0f);
            bloom.intensity.Override(mobile ? 0.45f : 0.7f);
            bloom.scatter.Override(0.65f);
            bloom.highQualityFiltering.Override(!mobile);

            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.25f);
            color.contrast.Override(12f);
            color.saturation.Override(8f);

            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.Override(0.24f);
            vignette.smoothness.Override(0.45f);

            var go = new GameObject("Post-processing");
            go.transform.SetParent(parent, false);
            var volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 1f;
            volume.sharedProfile = profile;
#endif
        }

        /// <summary>Lower render resolution on phones (builds only: never modifies the asset in the editor).</summary>
        public static void ApplyMobileQuality()
        {
#if INDUSTRIA_URP && !UNITY_EDITOR
            if (!Application.isMobilePlatform) return;
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp)
            {
                urp.renderScale = Screen.dpi > 320f ? 0.75f : 0.9f;
                urp.shadowDistance = 55f;
            }
#endif
        }
    }
}
