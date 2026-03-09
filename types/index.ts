export interface Profile {
    id: string
    display_name: string
    avatar_url: string | null
    created_at: string
}

export interface Character {
    id: string
    user_id: string
    name: string
    image_url: string | null
    level: number
    class: string
    race: string
    str: number
    dex: number
    int: number
    wil: number
    armor: number
    hit_points: number
    notes: string
    created_at: string
    updated_at: string
}

export type CharacterFormData = Omit<Character, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type LevelUpEditableField = 'str' | 'dex' | 'int' | 'wil' | 'armor' | 'hit_points'

export interface DocumentFile {
    name: string
    path: string
    displayName: string
    size: number
    created_at: string
}
