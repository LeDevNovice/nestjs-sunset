/**
 * Must run before any decorated class is imported, otherwise
 * Reflect.getMetadata calls made by NestJS's DI container throw
 * instead of returning the SWC emitted metadata.
 */
import 'reflect-metadata';
