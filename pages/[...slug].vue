<template>
    <v-container class="fill-height" fluid>
        <v-row align="center" justify="center">
            <v-col cols="12" class="text-center">
                <v-icon size="80" color="grey-lighten-1">mdi-map-search-outline</v-icon>
                <h1 class="text-h4 mt-4">Page Not Found</h1>
                <p class="text-body-1 text-medium-emphasis mt-2">
                    This page doesn't exist or may have been moved.
                </p>
                <v-btn color="primary" class="mt-6" :to="{ name: 'dashboard' }">
                    Back to Dashboard
                </v-btn>
            </v-col>
        </v-row>
    </v-container>
</template>
