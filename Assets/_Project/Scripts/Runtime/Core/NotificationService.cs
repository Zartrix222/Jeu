using System.Collections.Generic;
using UnityEngine;

namespace Industria.Core
{
    public enum NotificationKind { Info, Success, Warning }

    /// <summary>Short on-screen messages ("+1 Minerai de fer", "Partie sauvegardée"...).</summary>
    public sealed class NotificationService
    {
        public sealed class Entry
        {
            public string Text;
            public NotificationKind Kind;
            public float ExpiresAt;
            public int Count = 1;
        }

        private const int MaxEntries = 6;
        private readonly List<Entry> _entries = new List<Entry>();

        public IReadOnlyList<Entry> Entries => _entries;

        public void Push(string text, NotificationKind kind = NotificationKind.Info, float duration = 3f)
        {
            float now = Time.unscaledTime;
            // Merge identical consecutive messages ("+1 Minerai de fer x5").
            if (_entries.Count > 0)
            {
                var last = _entries[_entries.Count - 1];
                if (last.Text == text && last.ExpiresAt > now)
                {
                    last.Count++;
                    last.ExpiresAt = now + duration;
                    return;
                }
            }
            _entries.Add(new Entry { Text = text, Kind = kind, ExpiresAt = now + duration });
            if (_entries.Count > MaxEntries) _entries.RemoveAt(0);
        }

        public void Update()
        {
            float now = Time.unscaledTime;
            _entries.RemoveAll(e => e.ExpiresAt < now);
        }
    }
}
