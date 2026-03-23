export interface Profile {
    id: string
    display_name: string
    avatar_url: string | null
    created_at: string
    is_admin: boolean
    is_active: boolean
}

export interface Group {
    id: string
    name: string
    created_at: string
}

export interface UserGroup {
    user_id: string
    group_id: string
}

export interface AdminProfile extends Profile {
    groups: Group[]
}

export interface FeedbackItem {
    id: string
    user_id: string
    message: string
    category: 'comment' | 'bug' | 'feature_request'
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
    notes: string | null
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
