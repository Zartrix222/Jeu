using UnityEngine;
using UnityEngine.SceneManagement;

namespace Industria.Core
{
    /// <summary>
    /// Safety net: if the "Main" scene is opened without a GameRoot (e.g. scene recreated by hand),
    /// one is created automatically so the game always starts.
    /// </summary>
    public static class GameBootstrap
    {
        public const string MainSceneName = "Main";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void EnsureGameRoot()
        {
            if (SceneManager.GetActiveScene().name != MainSceneName) return;
            if (Object.FindFirstObjectByType<GameRoot>() != null) return;
            new GameObject("GameRoot").AddComponent<GameRoot>();
        }
    }
}
