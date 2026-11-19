// Minimal stand-ins for the URP API used by the editor setup (compile check only).
// Signatures mirror com.unity.render-pipelines.universal 14-17.
namespace UnityEngine.Rendering.Universal
{
    public abstract class ScriptableRendererData : ScriptableObject { }
    public class UniversalRendererData : ScriptableRendererData { }

    public class UniversalRenderPipelineAsset : RenderPipelineAsset
    {
        public static UniversalRenderPipelineAsset Create(ScriptableRendererData rendererData = null) => null;
        public float shadowDistance { get; set; }
        public int msaaSampleCount { get; set; }
        public bool supportsHDR { get; set; }
        public float renderScale { get; set; }
        public override RenderPipeline CreatePipeline() => null; // stub only; access differs between Unity versions
    }
}
