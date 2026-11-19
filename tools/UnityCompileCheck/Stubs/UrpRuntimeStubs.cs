// Minimal stand-ins for URP / Core RP runtime API used by the game (compile check only).
// Signatures mirror com.unity.render-pipelines.core / universal 14-17.
namespace UnityEngine.Rendering
{
    public abstract class VolumeParameter { }
    public class VolumeParameter<T> : VolumeParameter
    {
        public T value;
        public bool overrideState;
        public virtual void Override(T x) { overrideState = true; value = x; }
    }
    public class FloatParameter : VolumeParameter<float> { }
    public class MinFloatParameter : FloatParameter { }
    public class ClampedFloatParameter : FloatParameter { }
    public class BoolParameter : VolumeParameter<bool> { }
    public class ColorParameter : VolumeParameter<Color> { }

    public class VolumeComponent : ScriptableObject { }

    public class VolumeProfile : ScriptableObject
    {
        public T Add<T>(bool overrides = false) where T : VolumeComponent => null;
    }

    public class Volume : MonoBehaviour
    {
        public bool isGlobal;
        public float priority;
        public VolumeProfile sharedProfile;
    }
}

namespace UnityEngine.Rendering.Universal
{
    public enum TonemappingMode { None, Neutral, ACES }
    public sealed class TonemappingModeParameter : VolumeParameter<TonemappingMode> { }
    public sealed class Tonemapping : VolumeComponent { public TonemappingModeParameter mode; }
    public sealed class Bloom : VolumeComponent
    {
        public MinFloatParameter threshold, intensity;
        public ClampedFloatParameter scatter;
        public BoolParameter highQualityFiltering;
    }
    public sealed class ColorAdjustments : VolumeComponent
    {
        public FloatParameter postExposure;
        public ClampedFloatParameter contrast, saturation;
        public ColorParameter colorFilter;
    }
    public sealed class Vignette : VolumeComponent { public ClampedFloatParameter intensity, smoothness; }

    public enum AntialiasingMode { None, FastApproximateAntialiasing, SubpixelMorphologicalAntiAliasing, TemporalAntiAliasing }

    public class UniversalAdditionalCameraData : MonoBehaviour
    {
        public bool renderPostProcessing { get; set; }
        public AntialiasingMode antialiasing { get; set; }
        public bool renderShadows { get; set; }
    }

    public static class CameraExtensions
    {
        public static UniversalAdditionalCameraData GetUniversalAdditionalCameraData(this Camera camera) => null;
    }
}
