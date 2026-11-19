using System;
using System.IO;
using Industria.Simulation.Save;
using UnityEngine;

namespace Industria.Save
{
    /// <summary>
    /// Local JSON saves in Application.persistentDataPath/Saves. Writes are atomic
    /// (temporary file + replace) and the previous save is kept as a backup.
    /// No network, no account.
    /// </summary>
    public sealed class SaveSystem
    {
        public const string DefaultSlot = "partie_1";

        public string Directory => Path.Combine(Application.persistentDataPath, "Saves");

        public string PathFor(string slot) => Path.Combine(Directory, slot + ".json");

        public bool Exists(string slot = DefaultSlot) => File.Exists(PathFor(slot)) || File.Exists(PathFor(slot) + ".bak");

        public bool Write(SaveGame save, string slot = DefaultSlot)
        {
            try
            {
                System.IO.Directory.CreateDirectory(Directory);
                save.savedAtUtc = DateTime.UtcNow.ToString("o");
                string json = JsonUtility.ToJson(save, false);
                string path = PathFor(slot);
                string temp = path + ".tmp";
                File.WriteAllText(temp, json);
                if (File.Exists(path))
                {
                    string backup = path + ".bak";
                    if (File.Exists(backup)) File.Delete(backup);
                    File.Move(path, backup);
                }
                File.Move(temp, path);
                Debug.Log($"[Save] Sauvegarde écrite : {path} ({json.Length / 1024f:F1} Ko)");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] Échec de la sauvegarde : {e}");
                return false;
            }
        }

        public SaveGame Read(string slot = DefaultSlot)
        {
            string path = PathFor(slot);
            var save = TryRead(path);
            if (save == null)
            {
                save = TryRead(path + ".bak");
                if (save != null) Debug.LogWarning("[Save] Sauvegarde principale illisible : restauration depuis la copie de secours.");
            }
            return save;
        }

        private static SaveGame TryRead(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                var save = JsonUtility.FromJson<SaveGame>(File.ReadAllText(path));
                if (save == null) return null;
                if (save.version > SaveGame.CurrentVersion)
                {
                    Debug.LogError($"[Save] Sauvegarde d'une version plus récente ({save.version}).");
                    return null;
                }
                return save;
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] Lecture impossible ({path}) : {e.Message}");
                return null;
            }
        }

        public void Delete(string slot = DefaultSlot)
        {
            string path = PathFor(slot);
            if (File.Exists(path)) File.Delete(path);
            if (File.Exists(path + ".bak")) File.Delete(path + ".bak");
        }
    }
}
