namespace Industria.Core
{
    /// <summary>
    /// Physics layers. Only Unity's built-in layers are used so the project works without editing the TagManager.
    /// </summary>
    public static class GameLayers
    {
        public const int Default = 0;
        /// <summary>Player, ghosts and other things raycasts must ignore.</summary>
        public const int IgnoreRaycast = 2;

        /// <summary>Everything a placement / interaction ray may hit.</summary>
        public const int WorldMask = ~(1 << IgnoreRaycast);
    }
}
